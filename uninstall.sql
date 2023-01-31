--
-- Online Module Management Platform
-- 
-- SQL uninstallation file for the files module
-- 
-- Author: The OMMP Team
-- Version: 1.0
--

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";

-- Delete the public files table
DROP TABLE IF EXISTS `{PREFIX}files_public`;

-- Delete the quotas tables
DROP TABLE IF EXISTS `{PREFIX}files_quotas`;
COMMIT;
