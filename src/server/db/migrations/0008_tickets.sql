-- Tickets on a project board. There is no assignee in this feature.
-- position is 0-based and contiguous within (projectId, status); the unique index
-- makes any bookkeeping mistake fail loudly instead of corrupting the order.
CREATE TABLE ticket(
  id TEXT PRIMARY KEY NOT NULL,
  projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 20000),
  status TEXT NOT NULL CHECK(status IN ('new','review','testing','end')),
  position INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  statusChangedAt TEXT NOT NULL
);
CREATE UNIQUE INDEX ticket_order ON ticket(projectId, status, position);
