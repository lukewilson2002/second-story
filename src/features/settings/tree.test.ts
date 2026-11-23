import { describe, expect, it } from "vitest";
import { buildCategoryTree, flattenCategoryTree, type CategoryRecord } from "@/lib/domain/categories";
import { findSiblingWithName, isHiddenFromPickers, moveProblem, moveTargets, sameName } from "./tree";

const cat = (id: string, parentId: string | null, name: string, archived = false): CategoryRecord => ({
  id,
  parentId,
  name,
  archived,
});

const CATEGORIES = [
  cat("movie", null, "Movie"),
  cat("dvd", "movie", "DVD"),
  cat("bluray", "movie", "Blu-ray"),
  cat("criterion", "bluray", "Criterion"),
  cat("book", null, "Book"),
  cat("vhs", "movie", "VHS", true),
  cat("tapes", "vhs", "Rental tapes"),
];

describe("moveProblem", () => {
  it("allows a move to the top level", () => {
    expect(moveProblem(CATEGORIES, "criterion", null)).toBeNull();
  });

  it("allows a move under an unrelated category or a sibling", () => {
    expect(moveProblem(CATEGORIES, "bluray", "book")).toBeNull();
    expect(moveProblem(CATEGORIES, "bluray", "dvd")).toBeNull();
  });

  it("allows keeping the current parent", () => {
    expect(moveProblem(CATEGORIES, "dvd", "movie")).toBeNull();
  });

  it("refuses a category as its own parent", () => {
    expect(moveProblem(CATEGORIES, "movie", "movie")).toBe("own_parent");
  });

  it("refuses a move under a child or a deeper descendant", () => {
    expect(moveProblem(CATEGORIES, "movie", "bluray")).toBe("under_descendant");
    expect(moveProblem(CATEGORIES, "movie", "criterion")).toBe("under_descendant");
    expect(moveProblem(CATEGORIES, "bluray", "criterion")).toBe("under_descendant");
  });

  it("reports a missing category or parent", () => {
    expect(moveProblem(CATEGORIES, "gone", null)).toBe("not_found");
    expect(moveProblem(CATEGORIES, "dvd", "gone")).toBe("parent_not_found");
  });

  it("does not hang on data that already loops", () => {
    const looped = [cat("a", "b", "A"), cat("b", "a", "B"), cat("c", null, "C")];
    expect(moveProblem(looped, "c", "a")).toBeNull();
    expect(moveProblem(looped, "a", "b")).toBe("under_descendant");
  });
});

describe("moveTargets", () => {
  it("leaves out the category and everything under it", () => {
    expect(moveTargets(CATEGORIES, "movie").map((category) => category.id)).toEqual(["book"]);
    expect(moveTargets(CATEGORIES, "bluray").map((category) => category.id)).toEqual(["movie", "dvd", "book", "vhs", "tapes"]);
  });

  it("offers only targets that moveProblem accepts", () => {
    for (const category of CATEGORIES) {
      for (const target of moveTargets(CATEGORIES, category.id)) {
        expect(moveProblem(CATEGORIES, category.id, target.id)).toBeNull();
      }
    }
  });

  it("does not let the moved category's children surface at the top level of a picker", () => {
    const options = flattenCategoryTree(buildCategoryTree(moveTargets(CATEGORIES, "movie"), { includeArchived: false }));
    expect(options.map((option) => option.id)).toEqual(["book"]);
  });
});

describe("findSiblingWithName", () => {
  it("matches case-insensitively and ignores surrounding spaces", () => {
    expect(findSiblingWithName(CATEGORIES, "movie", " dvd ")?.id).toBe("dvd");
    expect(sameName("Blu-ray", "BLU-RAY")).toBe(true);
  });

  it("only looks among siblings", () => {
    expect(findSiblingWithName(CATEGORIES, null, "DVD")).toBeNull();
    expect(findSiblingWithName(CATEGORIES, null, "book")?.id).toBe("book");
  });

  it("counts archived siblings", () => {
    expect(findSiblingWithName(CATEGORIES, "movie", "vhs")?.archived).toBe(true);
  });

  it("skips the category being renamed", () => {
    expect(findSiblingWithName(CATEGORIES, "movie", "dvd", "dvd")).toBeNull();
  });
});

describe("isHiddenFromPickers", () => {
  const byId = new Map(CATEGORIES.map((category) => [category.id, category]));

  it("is true for an archived category and for anything under one", () => {
    expect(isHiddenFromPickers("vhs", byId)).toBe(true);
    expect(isHiddenFromPickers("tapes", byId)).toBe(true);
  });

  it("is false elsewhere", () => {
    expect(isHiddenFromPickers("criterion", byId)).toBe(false);
  });
});
