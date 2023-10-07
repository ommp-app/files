--
-- Online Module Management Platform
-- 
-- SQL installation file for the files module
-- 
-- Author: The OMMP Team
-- Version: 1.0
--

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";

-- Creates the public files table
DROP TABLE IF EXISTS `{PREFIX}files_public`;
CREATE TABLE IF NOT EXISTS `{PREFIX}files_public` (
  `public_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner` int(11) NOT NULL,
  `shortlink_id` int(11) NOT NULL,
  `path` text COLLATE utf8mb4_unicode_ci NOT NULL,
  UNIQUE KEY `public_hash` (`public_hash`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Creates the quotas tables
-- Used to keep the current usage without browsing all the files each time
-- Only updated when a file is uploaded or changed
DROP TABLE IF EXISTS `{PREFIX}files_quotas`;
CREATE TABLE IF NOT EXISTS `{PREFIX}files_quotas` (
  `user_id` int(11) NOT NULL,
  `quota` bigint NOT NULL,
  UNIQUE KEY `user_id` (`user_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
COMMIT;