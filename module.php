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
	rrmdir(OMMP_ROOT . "/data/$id/");

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
    // TODO
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
    // TODO
	return FALSE;
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
    // TODO
    return FALSE;
}