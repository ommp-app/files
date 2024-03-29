<?php
/**
 * Online Module Management Platform
 * 
 * Main file for files module
 * Contains the required function to allow the module to work
 * 
 * @author  The OMMP Team
 * @version 1.0
 */

/**
 * Check a configuration value
 * 
 * @param string $name
 *      The configuration name (without the module name)
 * @param string $value
 *      The configuration value
 * @param Lang $lang
 *         The Lang object for the current module
 * 
 * @return boolean|string
 *      TRUE is the value is correct for the given name
 *      else a string explaination of the error
 */
function files_check_config($name, $value, $lang) {
    
	// Booleans
	if ($name == "images_preview" || $name == "use_shortlinks") {
		if ($value !== "0" && $value !== "1") {
			return $lang->get('value_0_or_1');
		}
		return TRUE;
	}

	// Positive integers
    if ($name == "quota") {
		if (!ctype_digit($value)) {
			return $lang->get('must_be_positive_integer');
		}
		return TRUE;
	}

	return FALSE;
}

/**
 * Handle user deletion calls
 * This function will be called by the plateform when a user is deleted,
 * it must delete all the data relative to the user
 * 
 * @param int $id
 *         The id of the user that will be deleted
 */
function files_delete_user($id) {
	global $sql, $db_prefix;

	// Delete from database
	$sql->exec("DELETE FROM {$db_prefix}files_public WHERE `owner` = " . $sql->quote($id));
	$sql->exec("DELETE FROM {$db_prefix}files_quotas WHERE `user_id` = " . $sql->quote($id));

    // Delete all the files and trash
	rrmdir(OMMP_ROOT . "/data/files/$id/");
	rrmdir(OMMP_ROOT . "/data/files/$id.trash/");

}

/**
 * Return the prepared path from a given path
 * 
 * @param string $path
 * 		The path to prepare
 * @return string
 * 		The prepared path inside the user directory
 */
function prepare_path($path) {
	global $user_dir;
	$path = str_replace("\\", "/", urldecode($path));
	$path = str_replace("../", "", $path);
	$path = str_replace("/..", "", $path);
	while (strpos($path, "//") !== FALSE) {
		$path = str_replace("//", "/", $path);
	}
	if (substr($path, 0, 1) != "/") {
		$path = "/" . $path;
	}
	if (substr($path, -1) == "/") {
		$path = substr($path, 0, -1);
	}
	return $path;
}

/**
 * Handle an API call
 * 
 * @param string $action
 *      The name of the action to process
 * @param array $data
 *      The data given with the action
 * 
 * @return array|boolean
 *      An array containing the data to respond
 *      FALSE if the action does not exists
 */
function files_process_api($action, $data) {
	global $user, $db_prefix, $sql, $config;

	/**
	 * Return the informations about a file or directory
	 * 
	 * @param string $path
	 * 		The full path of the file
	 * @param string $short_path
	 * 		The short path of the file (inside user directory)
	 * 
	 * @return array|null
	 * 		An array containing the informations
	 * 		NULL is the file does not exists
	 */
	function get_file_informations($path, $short_path) {
		global $user, $db_prefix, $sql;
		if (!file_exists($path)) {
			return NULL;
		}
		$is_dir = is_dir($path);
		$infos = [
			"type" => $is_dir ? "dir" : "file",
			"creation" => filectime($path),
			"formatted_creation" => date($user->module_lang->get("date_format"), filectime($path)),
			"modification" => filemtime($path),
			"formatted_modification" => date($user->module_lang->get("date_format"), filemtime($path)),
			"access" => fileatime($path),
			"formatted_access" => date($user->module_lang->get("date_format"), fileatime($path)),
			"shared" => $is_dir ? FALSE : dbExists("{$db_prefix}files_public", "owner = " . $sql->quote($user->id) . " AND `path` = " . $sql->quote($short_path))
		];
		// Add special informations for folders
		if ($is_dir) {
			$infos['child'] = count(scandir($path)) - 2;
			$icon_path = $path . "/.meta/icon";
			$infos['has_icon'] = file_exists($icon_path);
			if ($infos['has_icon']) {
				$infos['icon_version'] = filemtime($icon_path);
			}
			$infos['hidden'] = substr($path, -6) == "/.meta" || file_exists($path . "/.meta/hide");
			return $infos;
		}
		// Add special informations for files
		$infos['mime'] = better_mime_type($path);
		$infos['size'] = filesize($path);
		return $infos;
	}

	/**
	 * Check if a write operation over a given file does not overcome the quota
	 * Also check if the user can bypass the quota
	 * 
	 * @param string $file
	 * 		The file that will be write
	 * @param int $size
	 * 		The size in bytes of the file
	 * @param int $usage
	 * 		Current usage for the user
	 * @param int $quota
	 * 		The quota allowed to the user (0 for unlimited)
	 * @return array
	 * 		[TRUE if the operation is valid or FALSE if the operation cannot be done due to the quota, the usage difference in bytes]
	 */
	function check_quota($file, $size, $usage, $quota) {
		// Get the current size of the file
		$current_file_size = file_exists($file) ? (is_dir($file) ? folder_size($file) : filesize($file)) : 0;
		// Compute the usage difference cause by this operation
		$usage_delta = $size - $current_file_size;
		// Check if the write operation will not overcome the quota
		return [$quota == 0 || $quota >= $usage + $usage_delta, $usage_delta];
	}

	/**
	 * Empty the trash for a given user
	 * 
	 * @param int $user_id
	 * 		The user id
	 * 
	 * @return boolean
	 * 		TRUE if the trash is empty
	 * 		FALSE else
	 */
	function empty_trash($user_id) {
		global $sql, $db_prefix;

		$user_trash = OMMP_ROOT . "/data/files/$user_id.trash";

		// Iter over all files
		$size = 0;
		foreach (scandir($user_trash) as $file) {
			if ($file == "." || $file == "..") {
				continue;
			}
			$to_delete = $user_trash . "/" . $file;
			// If meta file, add the size to the total
			if (substr($file, -5) == ".meta") {
				$meta = @json_decode(@file_get_contents($to_delete));
				if ($meta === NULL) {
					continue;
				}
				$size += $meta->size;
			}
			// Delete the file / directory
			if (is_dir($to_delete)) {
				rrmdir($to_delete);
			} else {
				unlink($to_delete);
			}
		}

		// Update quota
		$sql->exec("UPDATE {$db_prefix}files_quotas SET quota = quota - $size WHERE user_id = " . $sql->quote($user_id));

		// Check if trash is empty
		return count(scandir($user_trash)) == 2;

	}

	// Check if user directory exists
	$user_dir = OMMP_ROOT . "/data/files/$user->id";
	if (!is_dir($user_dir)) {

		// Create user directory
		@mkdir($user_dir, 0777, TRUE);

		// Create default folders and set icons
		$icons_path = OMMP_ROOT . (is_core_module("files") ? "/core" : "") . "/modules/files/media/folders/";
		@mkdir($user_dir . "/icons_backup/.meta", 0777, TRUE); // For icons backup
		@mkdir($user_dir . "/.meta", 0777, TRUE); // For "/" protection
		@file_put_contents($user_dir . "/.meta/protected", ""); // Protect "/" from being deleted
		@file_put_contents($user_dir . "/icons_backup/.meta/protected", ""); // Protect "/icons_backup" from being deleted
		@file_put_contents($user_dir . "/icons_backup/.meta/hide", ""); // Hide "/icons_backup"
		foreach (["documents", "images", "videos", "musics"] as $folder) {
			@mkdir($user_dir . "/" . $user->module_lang->get($folder) . "/.meta", 0777, TRUE); // Create folder
			@copy($icons_path . $folder . ".svg", $user_dir . "/" . $user->module_lang->get($folder) . "/.meta/icon"); // Set icons
			@copy($icons_path . $folder . ".svg", $user_dir . "/icons_backup/" . $folder . ".svg"); // Backup icons for restoration
		}

	}

	// Check if user trash exists
	$user_trash = OMMP_ROOT . "/data/files/$user->id.trash";
	$trash_exists = is_dir($user_trash);
	if (!$trash_exists && $user->has_right("files.use_trash")) {
		// If trash is allowed and does not exists, we create it
		@mkdir($user_trash, 0777, TRUE);
	} else if ($trash_exists && !$user->has_right("files.use_trash")) {
		
		// If trash is not allowed but exists, we remove it
		empty_trash($user->id);

		// Delete the trash
		rrmdir($user_trash);
		
	}

	// Get user usage
	$usage = dbGetFirstLineSimple("{$db_prefix}files_quotas", "user_id = " . $sql->quote($user->id), "quota", TRUE);
	$max_quota = $user->has_right("files.bypass_quota") ? 0 : intval($config->get("files.quota"));

	// Create quota if needed
	if ($usage === FALSE) {
		// Get user files usage
		$usage = folder_size($user_dir);
		// Get trash size if needed
		if (is_dir($user_trash)) {
			foreach (scandir($user_trash) as $file) {
				if ($file != "." && $file != ".." && substr($file, -5) != ".meta") {
					// Get size
					$trashed_path = $user_trash . "/" . $file;
					$size = is_dir($trashed_path) ? folder_size($trashed_path) : filesize($trashed_path);
					$usage += $size;
					// Update meta file if needed
					$meta = @json_decode(@file_get_contents($trashed_path . ".meta"));
					if ($meta !== NULL && isset($meta->size) && $meta->size != $size) {
						$meta->size = $size;
						@file_put_contents($trashed_path . ".meta", @json_encode($meta));
					}
				}
			}
		}
		$sql->exec("INSERT INTO {$db_prefix}files_quotas VALUES (" . $sql->quote($user->id) . ", $usage)");
	} else {
		$usage = intval($usage);
	}
    
	if ($action == "list-files") {

		// Check the parameters
		if (!check_keys($data, ["path"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Prepare path
		$short_path = prepare_path($data['path']);
		$path = $user_dir . $short_path;

		// Check if directory exists
		if (!is_dir($path)) {
			// Return an error but check if the path corresponds to a dir
			return [
				"error" => $user->module_lang->get("dir_does_not_exists"),
				"is_file" => file_exists($path),
				"file_data" => get_file_informations($path, $short_path),
				"clean_path" => $short_path
			];
		}

		// Get files list and sort it for natural reading
		$files = scandir($path);
		natcasesort($files);

		// Get files informations
		$content_files = [];
		$content_dirs = [];
		foreach ($files as $file) {
			if ($file == "." || $file == "..") {
				continue;
			}
			$file_data = get_file_informations("$path/$file", "$short_path/$file");
			if ($file_data['type'] == "dir") {
				$content_dirs[$file] = $file_data;
			} else {
				$content_files[$file] = $file_data;
			}
		}

		// Return the list
		return [
			"ok" => TRUE,
			"files" => $content_dirs + $content_files, // Display directories before files
			"clean_path" => $short_path,
			"usage" => $usage,
			"quota" => $max_quota
		];

	} else if ($action == "file-data") {

		// Check the parameters
		if (!check_keys($data, ["path"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Prepare path
		$short_path = prepare_path($data['path']);
		$path = $user_dir . $short_path;

		// Return the data
		return [
			"ok" => TRUE,
			"data" => get_file_informations($path, $short_path),
			"clean_path" => $short_path
		];

	} else if ($action == "update-text-file") {

		// Check the parameters
		if (!check_keys($data, ["path"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Prepare path
		$short_path = prepare_path($data['path']);
		$path = $user_dir . $short_path;

		// Check the quota
		$future_quota = check_quota($path, strlen($data['content']), $usage, $max_quota);
		if (!$future_quota[0]) {
			return ["error" => $user->module_lang->get("quota_exceeded")];
		}

		// Write file
		$result = file_put_contents($path, $data['content']);

		// Check for error
		if ($result === FALSE) {
			return [
				"error" => $user->module_lang->get("write_error")
			];
		}

		// Save the new quota
		$sql->exec("UPDATE {$db_prefix}files_quotas SET quota = quota + $future_quota[1] WHERE user_id = " . $sql->quote($user->id));

		// Return success
		return [
			"ok" => TRUE,
			"clean_path" => $short_path,
			"bytes_write" => $result
		];

	} else if ($action == "upload") {

		// Check the parameters
		if (!check_keys($_FILES, ["user_file"]) || (!check_keys($data, ["path"]) && !check_keys($data, ["public_upload"]))) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage private files
		$public_upload = isset($data['public_upload']) && $data['public_upload'];
		if (!($user->has_right("files.allow_private_files") || ($public_upload && $user->has_right("files.allow_public_files")))) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Prepare path
		$short_path = $public_upload
			? ("/public_files/" . split_path(hash("sha256", hash_file("sha256", $_FILES['user_file']['tmp_name']) . "-" . time() . "-" . rand()), 5) . "/" . $_FILES['user_file']['name'])
			: (prepare_path($data['path']) . "/" . $_FILES['user_file']['name']);
		$path = $user_dir . $short_path;

		// Check if file exists
		if (file_exists($path)) {
			return ["error" => $user->module_lang->get("file_exists")];
		}

		// Check if we need to create a directory for upload
		$target_parent = dirname($path);
		if (!is_dir($target_parent)) {
			$create = @mkdir($target_parent, 0777, TRUE);
			if (!$create) {
				return ["error" => $user->module_lang->get("cannot_create_dir")];
			}
		}

		// Check the quota
		$future_quota = check_quota($path, $_FILES['user_file']['size'], $usage, $max_quota);
		if (!$future_quota[0]) {
			return ["error" => $user->module_lang->get("quota_exceeded")];
		}

		// Move file
		$result = move_uploaded_file($_FILES['user_file']['tmp_name'], $path);
		if ($result === FALSE) {
			return ["error" => $user->module_lang->get("cannot_move_temp")];
		}

		// Save the new quota
		$sql->exec("UPDATE {$db_prefix}files_quotas SET quota = quota + $future_quota[1] WHERE user_id = " . $sql->quote($user->id));

		// Return success
		return [
			"ok" => TRUE,
			"clean_path" => $short_path,
			"mime" => better_mime_type($path)
		];

	} else if ($action == "rename") {

		// Check the parameters
		if (!check_keys($data, ["path", "old_name", "new_name"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Prepare the path
		$short_path_old = prepare_path($data['path'] . "/" . $data['old_name']);
		$path_old = $user_dir . $short_path_old;
		$short_path_new = prepare_path($data['path'] . "/" . $data['new_name']);
		$path_new = $user_dir . $short_path_new;

		// Check if old file exists
		if (!file_exists($path_old)) {
			return ["error" => $user->module_lang->get("file_not_found")];
		}

		// Check if new file exists
		if (file_exists($path_new)) {
			return ["error" => $user->module_lang->get("file_exists")];
		}

		// Check if folder is protected
		if (file_exists($path_old . "/.meta/protected")) {
			return ["error" => $user->module_lang->get("protected_folder")];
		}

		// Check if we need to create a directory for renaming
		$target_parent = dirname($path_new);
		if (!is_dir($target_parent) && (substr($short_path_new, 0, strlen($short_path_old . "/")) != $short_path_old . "/")) {
			$create = @mkdir($target_parent, 0777, TRUE);
			if (!$create) {
				return ["error" => $user->module_lang->get("cannot_create_dir")];
			}
		}

		// Move the file
		$result = @rename($path_old, $path_new);

		// Search for errors
		if ($result === FALSE) {
			return ["error" => $user->module_lang->get("cannot_rename_file")];
		}

		// Update a potential shared file
		if (is_dir($path_new)) {
			$sql->exec("UPDATE {$db_prefix}files_public SET `path` = CONCAT(" . $sql->quote($short_path_new) . ", SUBSTR(`path`, " . strlen($short_path_old . "/") . ")) WHERE owner = " . $sql->quote($user->id) . " AND SUBSTR(`path`, 1, " . strlen($short_path_old . "/") . ") = " . $sql->quote($short_path_old . "/"));
		} else {
			$sql->exec("UPDATE {$db_prefix}files_public SET `path` = " . $sql->quote($short_path_new) . " WHERE owner = " . $sql->quote($user->id) . " AND `path` = " . $sql->quote($short_path_old));
		}

		// Return success
		return [
			"ok" => TRUE,
			"clean_path_old" => $short_path_old,
			"clean_path_new" => $short_path_new
		];

	} else if ($action == "move") {

		// Check the parameters
		if (!check_keys($data, ["file", "new_path"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Prepare the path
		$short_path_old = prepare_path($data['file']);
		$path_old = $user_dir . $short_path_old;
		$short_path_new = prepare_path($data['new_path'] . "/" . basename($data['file']));
		$path_new = $user_dir . $short_path_new;

		// Check if old file exists
		if (!file_exists($path_old)) {
			return ["error" => $user->module_lang->get("file_not_found")];
		}

		// Check if new file exists
		if (file_exists($path_new)) {
			return ["error" => $user->module_lang->get("file_exists")];
		}

		// Check if folder is protected
		if (file_exists($path_old . "/.meta/protected")) {
			return ["error" => $user->module_lang->get("protected_folder")];
		}

		// Move the file
		$result = @rename($path_old, $path_new);

		// Search for errors
		if ($result === FALSE) {
			return ["error" => $user->module_lang->get("cannot_move_file")];
		}

		// Update a potential shared file
		if (is_dir($path_new)) {
			$sql->exec("UPDATE {$db_prefix}files_public SET `path` = CONCAT(" . $sql->quote($short_path_new) . ", SUBSTR(`path`, " . strlen($short_path_old . "/") . ")) WHERE owner = " . $sql->quote($user->id) . " AND SUBSTR(`path`, 1, " . strlen($short_path_old . "/") . ") = " . $sql->quote($short_path_old . "/"));
		} else {
			$sql->exec("UPDATE {$db_prefix}files_public SET `path` = " . $sql->quote($short_path_new) . " WHERE owner = " . $sql->quote($user->id) . " AND `path` = " . $sql->quote($short_path_old));
		}

		// Return success
		return [
			"ok" => TRUE,
			"clean_path_old" => $short_path_old,
			"clean_path_new" => $short_path_new
		];

	} else if ($action == "copy") {

		// Check the parameters
		if (!check_keys($data, ["file", "new_path", "new_name"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Prepare the path
		$short_path_old = prepare_path($data['file']);
		$path_old = $user_dir . $short_path_old;
		$short_path_new = prepare_path($data['new_path'] . "/" . $data['new_name']);
		$path_new = $user_dir . $short_path_new;

		// Check if old file exists
		if (!file_exists($path_old)) {
			return ["error" => $user->module_lang->get("file_not_found")];
		}

		// Check if new file exists
		if (file_exists($path_new)) {
			return ["error" => $user->module_lang->get("file_exists")];
		}

		// Check if we try to copy a directory inside itself
		$is_dir = is_dir($path_old);
		if ($is_dir && (substr($short_path_new . '/', 0, strlen($short_path_old . '/')) == ($short_path_old . '/'))) {
			return ["error" => $user->module_lang->get("cannot_copy_dir_in_itself")];
		}

		// Check quota
		$future_quota = check_quota($path_new, $is_dir ? folder_size($path_old) : filesize($path_old), $usage, $max_quota);
		if (!$future_quota[0]) {
			return ["error" => $user->module_lang->get("quota_exceeded")];
		}

		// Check if we need to create a directory for renaming
		$target_parent = dirname($path_new);
		if (!is_dir($target_parent)) {
			$create = @mkdir($target_parent, 0777, TRUE);
			if (!$create) {
				return ["error" => $user->module_lang->get("cannot_create_dir")];
			}
		}

		// Copy the file / dir
		$result = $is_dir ? dir_copy($path_old, $path_new) : @copy($path_old, $path_new);

		// Search for errors
		if ($result === FALSE) {
			return ["error" => $user->module_lang->get("cannot_copy_file")];
		}

		// Save the new quota
		$sql->exec("UPDATE {$db_prefix}files_quotas SET quota = quota + $future_quota[1] WHERE user_id = " . $sql->quote($user->id));

		// Return success
		return [
			"ok" => TRUE,
			"clean_path_old" => $short_path_old,
			"clean_path_new" => $short_path_new
		];

	} else if ($action == "delete") {

		// Check the parameters
		if (!check_keys($data, ["path"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Detect if we want to skip trash
		$skip_trash = isset($data['skip-trash']) && $data['skip-trash'] == "1";

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Check if we delete the file from the trash
		$from_trash = isset($data['from_trash']) && $data['from_trash'] == "true";

		// Prepare the path
		$short_path = prepare_path($data['path']);
		$path = ($from_trash ? $user_trash : $user_dir) . $short_path;

		// Check if old file exists
		if (!file_exists($path)) {
			return ["error" => $user->module_lang->get("file_not_found")];
		}

		// Check if folder is protected
		if (file_exists($path . "/.meta/protected")) {
			return ["error" => $user->module_lang->get("protected_folder")];
		}

		// Check if is directory
		$is_dir = is_dir($path);

		// Get the size
		$size = $is_dir ? folder_size($path) : filesize($path);

		// If not from trash, delete the file sharing
		if (!$from_trash) {
			// Delete all file sharing associated
			if ($is_dir) {
				// For folder, remove all the sub-shared files
				$where = "`owner` = " . $sql->quote($user->id) . " AND SUBSTR(`path`, 1, " . strlen($short_path . "/") . ") = " . $sql->quote($short_path . "/");
				$query = $sql->query("SELECT shortlink_id FROM {$db_prefix}files_public WHERE $where");
				while ($share = $query->fetch()) {
					if ($share['shortlink_id'] != "0") {
						module_api_internal_call("shorturl", "delete-link", ["id" => $share['shortlink_id']]);
					}
				}
				$query->closeCursor();
				$sql->exec("DELETE FROM {$db_prefix}files_public WHERE $where");
			} else {
				// For file, match only the deleted file
				$where = "`owner` = " . $sql->quote($user->id) . " AND `path` = " . $sql->quote($short_path);
				$shortlink_id = dbGetFirstLineSimple("{$db_prefix}files_public", $where, "shortlink_id", TRUE);
				if ($shortlink_id !== FALSE && $shortlink_id != "0") {
					module_api_internal_call("shorturl", "delete-link", ["id" => $shortlink_id]);
				}
				$sql->exec("DELETE FROM {$db_prefix}files_public WHERE $where");
			}
		}

		// Check if must move it to trash
		if (!$from_trash && $user->has_right("files.use_trash") && !$skip_trash) {

			// Get a random name for the trash
			$random_name = random_str(10);
			$trash_path = $user_trash . "/" . $random_name;

			// Moves the file to trash
			$result = rename($path, $trash_path);

			// Check for errors
			if ($result === FALSE) {
				return ["error" => $user->module_lang->get("cannot_trash")];
			}
			
			// Write metadata
			file_put_contents($trash_path . ".meta", json_encode(["path" => $short_path, "delete_ts" => time(), "size" => $size]));

			// Return success
			return ["ok" => TRUE, "message" => $user->module_lang->get("trashed")];

		} else {

			// If trash disabled or file already from trash

			// Remove it
			$result = $is_dir ? rrmdir($path) : unlink($path);

			// Check for errors
			if ($result === FALSE) {
				return ["error" => $user->module_lang->get("cannot_delete")];
			}
			
			// Remove meta if from trash
			if ($from_trash) {
				unlink($path . ".meta");
			}

			// Update the quota
			$sql->exec("UPDATE {$db_prefix}files_quotas SET quota = quota - $size WHERE user_id = " . $sql->quote($user->id));

			// Return success
			return ["ok" => TRUE, "message" => $user->module_lang->get("deleted")];

		}

	} else if ($action == "list-trash") {

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Check if user has the right to use the trash
		if (!$user->has_right("files.use_trash")) {
			return ["error" => $user->module_lang->get("trash_disallowed")];
		}

		// List the files in trash
		$files = [];
		$size = 0;
		foreach (scandir($user_trash) as $file) {
			if (substr($file, -5) == ".meta") {
				$meta = @json_decode(@file_get_contents($user_trash . "/" . $file));
				if ($meta === NULL) {
					continue;
				}
				$trash_id = substr($file, 0, -5);
				$trash_path = $user_trash . "/" . $trash_id;
				$files[$trash_id] = [
					"path" => $meta->path,
					"type" => is_dir($trash_path) ? "dir" : "file",
					"deleted" => $meta->delete_ts,
					"formatted_deleted" => date($user->module_lang->get("date_format"), $meta->delete_ts),
					"size" => $meta->size
				];
				$size += $meta->size;
			}
		}

		// Return list
		return [
			"ok" => TRUE,
			"files" => $files,
			"size" => $size
		];

	} else if ($action == "restore") {

		// Check the parameters
		if (!check_keys($data, ["id"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Check if user has the right to use the trash
		if (!$user->has_right("files.use_trash")) {
			return ["error" => $user->module_lang->get("trash_disallowed")];
		}

		// Get the trash path
		$trash_path = $user_trash . "/" . $data['id'];

		// Get the trashed file metadata
		$meta = @json_decode(@file_get_contents($trash_path . ".meta"));

		// Check error
		if ($meta === NULL) {
			return ["error" => $user->module_lang->get("cannot_read_trash_meta")];
		}

		// Get the destination path
		$dest_path = $user_dir . $meta->path;

		// Check if the destination exists
		if (file_exists($dest_path)) {
			return ["error" => $user->module_lang->get("file_exists")];
		}

		// Check if we need to create a directory for restoration
		$target_parent = dirname($dest_path);
		if (!is_dir($target_parent)) {
			$create = @mkdir($target_parent, 0777, TRUE);
			if (!$create) {
				return ["error" => $user->module_lang->get("cannot_create_dir")];
			}
		}

		// Try to move the file
		$result = rename($trash_path, $dest_path);

		// Check error
		if ($result === FALSE) {
			return ["error" => $user->module_lang->get("cannot_restore")];
		}

		// Delete metedata file
		unlink($trash_path . ".meta");

		// Return success
		return [
			"ok" => TRUE,
			"message" => $user->module_lang->get("restore_success")
		];

	} else if ($action == "empty-trash") {

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Check if user has the right to use the trash
		if (!$user->has_right("files.use_trash")) {
			return ["error" => $user->module_lang->get("trash_disallowed")];
		}

		// Empty the trash
		$result = empty_trash($user->id);
		
		// Check error
		if ($result === FALSE) {
			return ["error" => $user->module_lang->get("empty_trash_error")];
		}

		// Return success
		return [
			"ok" => TRUE,
			"message" => $user->module_lang->get("emptied_trash")
		];

	} else if ($action == "create-folder") {

		// Check the parameters
		if (!check_keys($data, ["folder"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Prepare the path
		$short_path = prepare_path($data['folder']);
		$path = $user_dir . $short_path;

		// Check if already exists
		if (file_exists($path)) {
			return ["error" => $user->module_lang->get("file_exists")];
		}

		// Create it
		$create = @mkdir($path, 0777, TRUE);
		if (!$create) {
			return ["error" => $user->module_lang->get("cannot_create_dir")];
		}

		// Return success
		return [
			"ok" => TRUE,
			"clean_path" => $short_path
		];

	} else if ($action == "create-file") {

		// Check the parameters
		if (!check_keys($data, ["file"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage private files
		if (!$user->has_right("files.allow_private_files")) {
			return ["error" => $user->module_lang->get("private_files_disallowed")];
		}

		// Prepare the path
		$short_path = prepare_path($data['file']);
		$path = $user_dir . $short_path;

		// Check if already exists
		if (file_exists($path)) {
			return ["error" => $user->module_lang->get("file_exists"), "path" => $path];
		}

		// Check if we must create parent dir
		$parent = dirname($path);
		if (!file_exists($parent)) {
			$create_parent = @mkdir($parent, 0777, TRUE);
			if (!$create_parent) {
				return ["error" => $user->module_lang->get("cannot_create_dir")];
			}
		}

		// Create the file
		$create = file_put_contents($path, "");
		if ($create === FALSE) {
			return ["error" => $user->module_lang->get("cannot_create_file")];
		}

		// Return success
		return [
			"ok" => TRUE,
			"clean_path" => $short_path
		];

	} else if ($action == "get-share-status") {

		// Check the parameters
		if (!check_keys($data, ["file"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage public files
		if (!$user->has_right("files.allow_public_files")) {
			return ["error" => $user->module_lang->get("public_files_disallowed")];
		}

		// Get public file informations
		$file_infos = dbGetFirstLineSimple("{$db_prefix}files_public", "owner = " . $sql->quote($user->id) . " AND `path` = " . $sql->quote($data['file']));

		// Check if file is found
		if ($file_infos === FALSE) {
			return [
				"error" => $user->module_lang->get("public_file_not_found"),
				"sharing_allowed" => !is_dir($user_dir . "/" . prepare_path($data['file']))
			];
		}

		// Get shortlinks informations
		$shortlink_infos = FALSE;
		if ($config->get("files.use_shortlinks") == "1") {
			$shortlink = module_api_internal_call("shorturl", "get-informations", ["id" => $file_infos['shortlink_id']]);
			if (isset($shortlink["ok"]) && isset($shortlink["ok"]) === TRUE) {
				$shortlink_infos = $shortlink['link'];
			}
		}

		// Return the informations
		return [
			"ok" => TRUE,
			"informations" => $file_infos,
			"shortlink" => $shortlink_infos
		];

	} else if ($action == "share") {

		// Check the parameters
		if (!check_keys($data, ["file"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage public files
		if (!$user->has_right("files.allow_public_files")) {
			return ["error" => $user->module_lang->get("public_files_disallowed")];
		}

		// Prepare the path
		$short_path = prepare_path($data['file']);
		$path = $user_dir . $short_path;

		// Check if sharing already exists
		if (dbExists("{$db_prefix}files_public", "owner = " . $sql->quote($user->id) . " AND `path` = " . $sql->quote($data['file']))) {
			// Already shared does not return an error to allow public uploads
			return [
				"ok" => TRUE,
				"clean_path" => $short_path
			];
			//return ["error" => $user->module_lang->get("file_already_shared")];
		}

		// Check if private file exists
		if (!file_exists($path) || is_dir($path)) {
			return ["error" => $user->module_lang->get("file_not_found")];
		}

		// Generate a public hash for the file
		$public_hash = hash("sha256", $user->id . "-" . hash_file("sha256", $path) . "-" . time() . "-" . rand() . "-" . $short_path);

		// Try to create a short link
		$short_id = 0;
		$domain_base = $config->get("ommp.scheme") . "://" . $config->get("ommp.domain") . $config->get("ommp.dir");
		if ($config->get("files.use_shortlinks") == "1") {
			$long_link = "{$domain_base}public-file/$public_hash";
			$short_link = module_api_internal_call("shorturl", "shorten-link", ["url" => $long_link]);
			if (isset($short_link["ok"]) && isset($short_link["ok"]) === TRUE) {
				$short_id = $short_link['link']['id'];
			}
		}

		// Save share to database
		$result = $sql->exec("INSERT INTO {$db_prefix}files_public VALUES (" . $sql->quote($public_hash) . ", " . $sql->quote($user->id) . ", " . $sql->quote($short_id) . ", " . $sql->quote($short_path) . ")");

		// Check for error
		if ($result === FALSE) {

			// In case of error, try to delete the short link
			if ($config->get("files.use_shortlinks") == "1" && $short_id != 0) {
				module_api_internal_call("shorturl", "delete-link", ["id" => $short_id]);
			}

			// Return an error
			return ["error" => $user->module_lang->get("cannot_share_file")];

		}

		// Return success
		return [
			"ok" => TRUE,
			"clean_path" => $short_path
		];

	} else if ($action == "stop-sharing") {

		// Check the parameters
		if (!check_keys($data, ["file"])) {
			return ["error" => $user->module_lang->get("missing_parameter")];
		}

		// Check if user has the right to manage public files
		if (!$user->has_right("files.allow_public_files")) {
			return ["error" => $user->module_lang->get("public_files_disallowed")];
		}

		// Prepare request
		$request = "owner = " . $sql->quote($user->id) . " AND `path` = " . $sql->quote($data['file']);

		// Get share informations
		$share_infos = dbGetFirstLineSimple("{$db_prefix}files_public", $request);

		// Check if sharing exists
		if ($share_infos === FALSE) {
			return ["error" => $user->module_lang->get("public_file_not_found")];
		}

		// Delete from database
		$result = $sql->exec("DELETE FROM {$db_prefix}files_public WHERE $request");

		// Check for error
		if ($result === FALSE) {
			return ["error" => $user->module_lang->get("cannot_delete_share")];
		}

		// Check if we must delete a shorturl
		if ($share_infos['shortlink_id'] != "0") {
			module_api_internal_call("shorturl", "delete-link", ["id" => $share_infos['shortlink_id']]);
		}

		// Delete file if private file is disabled
		if (!$user->has_right("files.allow_private_files")) {
			// Get path
			$short_path = $share_infos['path'];
			$path = $user_dir . $short_path;
			// Get size
			$size = filesize($path);
			// Delete file
			@unlink($path);
			// Update quota
			$sql->exec("UPDATE {$db_prefix}files_quotas SET quota = quota - $size WHERE user_id = " . $sql->quote($user->id));
		}

		// Return success
		return [
			"ok" => TRUE,
			"message" => $user->module_lang->get("share_deleted")
		];

	} else if ($action == "list-public") {

		// Check if user has the right to manage public files
		if (!$user->has_right("files.allow_public_files")) {
			return ["error" => $user->module_lang->get("public_files_disallowed")];
		}

		// Check if user has the right to list public files
		if (!$user->has_right("files.list_public_files")) {
			return ["error" => $user->module_lang->get("public_list_disallowed")];
		}

		// List the files
		$files = [];
		$query = $sql->query("SELECT `path` FROM {$db_prefix}files_public WHERE `owner` = " . $sql->quote($user->id));
		while ($share = $query->fetch()) {
			$files[] = $share['path'];
		}
		$query->closeCursor();

		// Return the files
		return [
			"ok" => TRUE,
			"files" => $files
		];

	}

    return FALSE;
}

/**
 * Handle page loading for the module
 * 
 * @param string $page
 *      The page requested in the module
 * @param string $pages_path
 *      The absolute path where the pages are stored for this module
 * 
 * @return array|boolean
 *      An array containing multiple informations about the page as described below
 *      [
 *          "content" => The content of the page,
 *          "title" => The title of the page,
 *          "og_image" => The Open Graph image (optional),
 *          "description" => A description of the web page
 *      ]
 *      FALSE to generate a 404 error
 */
function files_process_page($page, $pages_path) {
    global $user;
    // This module uses only the HTML files without processing them
    return module_simple_html($page, $pages_path, [], [
		"" => $user->module_lang->get("my_files")
    ]);
}

/**
 * Handle the special URL pages
 * 
 * @param string $url
 *      The url to check for a special page
 * 
 * @return boolean
 *      TRUE if this module can process this url (in this case this function will manage the whole page display)
 *      FALSE else (in this case, we will check the url with the remaining modules, order is defined by module's priority value)
 */
function files_url_handler($url) {
	global $user, $config, $db_prefix, $sql;
    
	// Check if url is a private file loading
	if (substr($url, 0, 13) == "private-file/" && $user->has_right("files.allow_private_files")) {

		// Get path
		$path = OMMP_ROOT . "/data/files/$user->id/" . prepare_path(substr($url, 13));

		// If file exists then we display it
		if ($path != "" && file_exists($path) && !is_dir($path)) {

			// Display thumb if needed and allowed
			if (isset($_GET['s']) && $config->get("files.images_preview") == "1") {
				$result = get_image_thumbnail($path, intval($_GET['s']), 75);
				if ($result) {
					exit();
				}
			}

			// Set content type and size
			header('Content-Type: ' . mime_content_type($path));
			header('Content-Length: ' . filesize($path));

			// Set cache expiration
			headers_cache();

			// Read the file
			readfile($path);

			// Exit to prevent other executions
			exit();

		}

	}
	
	// Check if we try to load a public file
	else if (substr($url, 0, 12) == "public-file/") {
		
		// Get public hash
		$public_hash = substr($url, 12);

		// Get informations
		$share = dbGetFirstLineSimple("{$db_prefix}files_public", "public_hash = " . $sql->quote($public_hash));

		// Check for error
		if ($share === FALSE) {
			return FALSE;
		}

		// Check if owner can manage public files
		$owner = new User(intval($share['owner']));
		if (!$owner->has_right("files.allow_public_files")) {
			return FALSE;
		}

		// Get path
		$path = OMMP_ROOT . "/data/files/$owner->id/" . prepare_path($share['path']);

		// Check if file exist
		if (!file_exists($path)) {
			return FALSE;
		}

		// Set content type and size
		header('Content-Type: ' . mime_content_type($path));
		header('Content-Length: ' . filesize($path));
		header('Content-disposition: inline; filename="' . str_replace('"', '\\"', basename($path)) . '"');

		// Set cache expiration
		headers_cache();

		// Read the file
		readfile($path);

		// Exit to prevent other executions
		exit();

	}

    return FALSE;
}