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

    // Delete all the files
	rrmdir(OMMP_ROOT . "/data/files/$id/");

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
	global $user;

	/**
	 * Return the informations about a file or directory
	 * 
	 * @param string $path
	 * 		The path of the file
	 * 
	 * @return array|null
	 * 		An array containing the informations
	 * 		NULL is the file does not exists
	 */
	function get_file_informations($path) {
		global $user;
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
			"formatted_access" => date($user->module_lang->get("date_format"), fileatime($path))
		];
		// Add special informations for folders
		if ($is_dir) {
			$infos['child'] = count(scandir($path)) - 2;
			return $infos;
		}
		// Add special informations for files
		$infos['mime'] = better_mime_type($path);
		$infos['size'] = filesize($path);
		return $infos;
	}

	// Check if user directory exists
	$user_dir = OMMP_ROOT . "/data/files/$user->id";
	if (!is_dir($user_dir)) {
		@mkdir(OMMP_ROOT . "/data/files/$user->id", 0777, TRUE);
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
		$path = $data['path'];
		$path = str_replace("\\", "/", $path);
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
		$short_path = $path;
		$path = $user_dir . $path;

		// Check if directory exists
		if (!is_dir($path)) {
			// Return an error but check if the path corresponds to a dir
			return [
				"error" => $user->module_lang->get("dir_does_not_exists"),
				"is_file" => file_exists($path),
				"file_data" => get_file_informations($path),
				"clean_path" => $short_path
			];
		}

		// Get the content of the directory
		$content = [];
		foreach (scandir($path) as $file) {
			if ($file == "." || $file == "..") {
				continue;
			}
			$content[$file] = get_file_informations("$path/$file");
		}

		// Return the list
		return [
			"ok" => TRUE,
			"files" => $content,
			"clean_path" => $short_path
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
	global $user;
    
	// Check if url is a private file loading
	$path = "";
	if (substr($url, 0, 13) == "private-file/" && strpos($url, "..") === FALSE && $user->has_right("files.allow_private_files")) {
		$path = OMMP_ROOT . "/data/files/$user->id/" . substr($url, 13);
	}
	//print("PATH: $path");

	// TODO: Public file

	// If file exists then we display it
	if ($path != "" && file_exists($path) && !is_dir($path)) {

		// Set content type and size
		header('Content-Type: ' . mime_content_type($path));
		header('Content-Length: ' . filesize($path));

		// Read the file
		readfile($path);

		// Exit to prevent other executions
		exit();

	}

    return FALSE;
}