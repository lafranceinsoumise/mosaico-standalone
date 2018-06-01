-- Up
CREATE TABLE emails (uuid VARCHAR(36) PRIMARY KEY, user VARCHAR(255), metadata TEXT, content TEXT, html TEXT);
-- Down
DROP TABLE emails;
