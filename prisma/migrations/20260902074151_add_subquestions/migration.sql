-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PaperQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "contentItemId" TEXT,
    "snapshotText" TEXT,
    "snapshotImageUrl" TEXT,
    "marks" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentQuestionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaperQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PaperSection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperQuestion_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PaperQuestion_parentQuestionId_fkey" FOREIGN KEY ("parentQuestionId") REFERENCES "PaperQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PaperQuestion" ("contentItemId", "createdAt", "id", "marks", "order", "sectionId", "snapshotImageUrl", "snapshotText", "updatedAt") SELECT "contentItemId", "createdAt", "id", "marks", "order", "sectionId", "snapshotImageUrl", "snapshotText", "updatedAt" FROM "PaperQuestion";
DROP TABLE "PaperQuestion";
ALTER TABLE "new_PaperQuestion" RENAME TO "PaperQuestion";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
