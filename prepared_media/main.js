// The last version of the file (to detect if file has changed)
let lastFileContent = '', lastFile = '';

// The current layout type
let layoutType = localStorage.getItem('files.layout') || 'grid';

// Should we display hidden files
let showHidden = localStorage.getItem('files.show_hidden') == '1';

// Global variable to prevent rescroll on list update
let preventRescroll = false;

// Special folders created by the system
let specialFolders = {
	'/{JS:L:DOCUMENTS}': 'documents',
	'/{JS:L:IMAGES}': 'images',
	'/{JS:L:VIDEOS}': 'videos',
	'/{JS:L:MUSICS}': 'musics'
};

// Fix negative modulo (thanks JavaScript)
Number.prototype.mod = function(n) {
	return ((this % n) + n) % n;
}

/**
 * Display the list of private files
 * 
 * @param {*} container The id of the parent HTML element
 * @param {*} path The path to display
 * @param {*} layout The layout type, 'list' or 'grid' (default is 'list')
 * @param {*} reScroll Save the scroll after re-draw (optional, default is true)
 * @param {*} keepPopup Should we keep the popup open (optional, default is false)
 */
function displayPrivateFileList(container, path, layout='list', reScroll=true, keepPopup=false) {
	// Prepare path
	if (!path.startsWith('/')) {
		path = '/' + path;
	}
	// Call the Api
	Api.apiRequest('files', 'list-files', {'path': path}, r => {
		// If path is a file, then displays it
		if (typeof r.is_file !== 'undefined' && r.is_file) {
			previewPrivateFile(r.file_data, r.clean_path);
			return;
		}
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Close the viewers if needed
		closeImagePreview();
		if (!keepPopup) {
			closePopup();
		}
		// Save the scroll to restore it in case of a refresh
		var scroll = [window.scrollX, window.scrollY];
		// Display current dir
		$('#' + container).html('');
		displayCurrentDir(container, r.clean_path);
		// Display
		var filesNumber = 0;
		if (layout == 'list') {
			filesNumber = renderLayoutList(container, r.clean_path, r.files);
		} else if (layout == 'grid') {
			filesNumber = renderLayoutGrid(container, r.clean_path, r.files);
		} else {
			notifError('{JS:L:UNKNOWN_LAYOUT}', '{JS:L:ERROR}');
		}
		// Check if empty
		if (filesNumber == 0) {
			$('#' + container).append('<i class="lighter">{JS:L:EMPTY_DIRECTORY}</i>');
		}
		// Add the file uploader
		$('#' + container).append('<div id="file-upload" class="mt-3 mb-4"></div>');
		appendFileUpload('file-upload', r.clean_path);
		// Add the quota informations
		displayQuota(container, r.usage, r.quota);
		// Reset scroll if needed
		window.scrollTo({
			left: scroll[0],
			top: reScroll ? scroll[1] : 0,
			behavior: 'instant'
		});
	});
}

/**
 * Displays the current directory with clickable links
 * 
 * @param {*} container The id of the parent element
 * @param {*} path The current path
 */
function displayCurrentDir(container, path) {
	// Add the button to change layout type
	var inverseLayout = layoutType == 'list' ? 'grid' : 'list', text = escapeHtmlProperty(layoutType == 'list' ? '{JS:L:LAYOUT_GRID}' : '{JS:L:LAYOUT_LIST}');
	$('#' + container).append('<img src="{JS:S:DIR}media/files/' + inverseLayout + '.svg" id="layout-selector" class="mb-3" alt="' + text + '" title="' + text + '"' +
		' onclick="updateLayoutType(\'' + inverseLayout + '\');" />');
	// Split the path
	let buildingPath = '';
	$('#' + container).append('<div id="current-path" class="mb-3">&gt;</div><br />');
	path.split('/').forEach(dir => {
		if (dir) {
			buildingPath += '/' + dir;
		}
		let path = buildingPath;
		$('#current-path').append(getInlineButton(dir || '{JS:L:MY_FILES}', () => {location.href = '#' + path;}));
		$('#current-path').append('/');
	});
	$('#current-path').append('<img src="{JS:S:DIR}media/files/plus.svg" onclick="createFolder(\'' + escapeHtmlProperty(path, true) + '\');" id="new-folder" alt="{JS:L:NEW_FILE_FOLDER}" title="{JS:L:NEW_FILE_FOLDER}" />');
}

/**
 * Displays the popup to create a folder
 * @param {*} path The path where we want to create the folder
 */
function createFolder(path) {
	var escapedPath = escapeHtmlProperty(path);
	var createFunc = '(\'' + escapedPath + '\',$(\'#new-folder-name\').val());';
	popup('{JS:L:NEW_FILE_FOLDER}', '<input type="text" id="new-folder-name" style="width:100%;display:inline-block;" class="form-control" value="" placeholder="' + escapeHtmlProperty('{JS:L:ENTER_NAME}') +
		'"/><div class="btn ms-2 mt-2 me-2 pt-1 pb-1 btn-light" style="vertical-align:baseline;" role="button" aria-pressed="true" onclick="doCreateFolder' + createFunc + '">{JS:L:CREATE_FOLDER}</div>' +
		'<div class="btn ms-2 mt-2 me-2 pt-1 pb-1 btn-light" style="vertical-align:baseline;" role="button" aria-pressed="true" onclick="doCreateFile' + createFunc + '">{JS:L:CREATE_FILE}</div>');
	$('#new-folder-name').focus();
}

/**
 * Call the API to create a folder
 * @param {*} path The path where to create the folder
 * @param {*} name The new folder name
 */
function doCreateFolder(path, name) {
	Api.apiRequest('files', 'create-folder', {'folder': path + '/' + name}, r => {
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Refresh file list
		displayPrivateFileList('content', path, layoutType);
		// Close the popup
		closePopup();
	});
}

/**
 * Call the API to create an empty file
 * @param {*} path The path where to create the file
 * @param {*} name The new file name
 */
function doCreateFile(path, name) {
	Api.apiRequest('files', 'create-file', {'file': path + '/' + name}, r => {
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Refresh file list
		displayPrivateFileList('content', path, layoutType);
		// Close the popup
		closePopup();
	});
}

/**
 * Update the layout type
 * @param {*} layoutType The type of layout to use ('list' or 'grid')
 */
function updateLayoutType(layout) {
	if (layout != 'list' && layout != 'grid') {
		return;
	}
	layoutType = layout;
	displayPrivateFileList('content', getPathFromHash(), layoutType);
	localStorage.setItem('files.layout', layout);
	$('#content').css('textAlign', layout == 'grid' ? 'center' : 'left');
}

/**
 * Return a clickable button
 * 
 * @param {*} content The text of the button (won't be escaped)
 * @param {*} callback The function to call on click
 * @param {*} className The name of the class to add (optional)
 * 
 * @return The HTML element of the button (not the source code!)
 */
function getInlineButton(content, callback, className='') {
	var div = document.createElement('div');
	div.classList.add('btn', 'pt-0', 'pb-0', 'ps-1', 'pe-1', 'ms-1', 'me-1', 'btn-light');
	if (className != '') {
		div.classList.add(className);
	}
	div.style.verticalAlign = 'baseline';
	div.setAttribute('role', 'button');
	div.setAttribute('aria-pressed', 'true');
	div.onclick = callback;
	div.innerHTML = content;
	return div;
}

/**
 * Displays a list of files
 * 
 * @param {*} container The id of the parent element
 * @param {*} path The current path
 * @param {*} files The list of the files as returned by the API
 * @return {*} The number of files displayed
 */
function renderLayoutList(container, path, files) {
	// Display the files
	var filesNumber = 0;
	var content = '<table class="w-100 table-layout-fixed"><tr><th class="pb-2 w-30">{JS:L:FILE}</th><th class="pb-2 w-20 hidden-mobile">{JS:L:TYPE}</th><th class="pb-2 w-20 hidden-mobile">{JS:L:SIZE} / {JS:L:CHILD}</th>' + 
		'<th class="pb-2 w-30 hidden-mobile">{JS:L:LAST_MODIFICATION}</th></tr>';
	for (const [file, attributes] of Object.entries(files)) {
		var is_dir = attributes.type == 'dir', hidden = is_dir && attributes.hidden;
		if (hidden && !showHidden) {
			continue;
		}
		var type = is_dir ? '{JS:L:DIRECTORY}' : getType(attributes.mime);
		var escapedFileName = escapeHtmlProperty(path, true) + '/' + escapeHtmlProperty(file, true);
		var hasIcon = typeof attributes.has_icon !== 'undefined' && attributes.has_icon;
		content += '<tr' + (hidden ? ' style="opacity:0.5;"' : '') + '><td class="pb-2"><span style="cursor:pointer;" class="me-2 lighter file-edit-btn" title="{JS:L:EDIT}" onclick="editFile(\'' + escapedFileName +
		'\',\'' + escapeHtmlProperty(attributes.type == 'dir' ? 'dir' : attributes.mime, true) + '\', ' + hasIcon + ', ' + (attributes.hidden ? 'true' : 'false') + ');">&bull;&bull;&bull;</span>' +
		(attributes.shared ? '<img src="{JS:S:DIR}media/files/share.svg"  onclick="event.stopPropagation();manageSharing(\'' + escapedFileName + '\');" class="file-shared-btn" alt="{JS:L:SHARED}" title="{JS:L:SHARED}" />' : '') +
		'<span style="cursor:pointer;" title="' + escapeHtml(file) + '" onclick="preventRescroll=true;location.href=\'#' + escapedFileName + '\';"><div class="me-2 list-image-bg" style="background:#fff url(&quot;' +
		escapeHtmlProperty(encodeURI(getIcon(is_dir ? 'dir' : attributes.mime, path + '/' + file, attributes.modification, hasIcon, hasIcon ? attributes.icon_version : 0))) + '&quot;) center center/contain no-repeat;"></div>' +
		escapeHtml(file) + '</span></td><td class="pb-2 hidden-mobile" title="' + escapeHtmlProperty(type) + '">' + type + '</td><td class="pb-2 hidden-mobile">' + (is_dir ? attributes.child + ' {JS:L:ELEMENTS}' : humanFileSize(attributes.size)) +
		'</td><td class="pb-2 hidden-mobile">' + escapeHtml(attributes.formatted_modification) + '</td></tr>';
		filesNumber++;
	}
	$('#' + container).append(content + '</table>');
	return filesNumber;
}

/**
 * Displays a grid of files
 * 
 * @param {*} container The id of the parent element
 * @param {*} path The current path
 * @param {*} files The list of the files as returned by the API
 * @return {*} The number of files displayed
 */
function renderLayoutGrid(container, path, files) {
	// Display the files
	var filesNumber = 0;
	var content = '<div id="grid-display">';
	for (const [file, attributes] of Object.entries(files)) {
		var is_dir = attributes.type == 'dir', hidden = is_dir && attributes.hidden;
		if (hidden && !showHidden) {
			continue;
		}
		var escapedFileName = escapeHtmlProperty(path, true) + '/' + escapeHtmlProperty(file, true);
		var hasIcon = typeof attributes.has_icon !== 'undefined' && attributes.has_icon;
		content += '<div class="grid-element" title="' + escapeHtml(file) + '" onclick="preventRescroll=true;location.href=\'#' + escapedFileName + '\';"' + (hidden ? ' style="opacity:0.5;"' : '') + '>' +
		'<span class="me-2 lighter file-edit-btn" title="{JS:L:EDIT}" onclick="event.stopPropagation();editFile(\'' + escapedFileName + '\',\'' + escapeHtmlProperty(attributes.type == 'dir' ? 'dir' : attributes.mime, true) +
		'\', ' + hasIcon + ', ' + (attributes.hidden ? 'true' : 'false') + ');">&bull;&bull;&bull;</span>' + (attributes.shared ? '<img src="{JS:S:DIR}media/files/share.svg"  onclick="event.stopPropagation();manageSharing(\'' +
		escapedFileName + '\');" class="file-shared-btn" alt="{JS:L:SHARED}" title="{JS:L:SHARED}" />' : '') + '<div class="grid-image-bg" style="background:#fff url(&quot;' + 
		escapeHtmlProperty(encodeURI(getIcon(is_dir ? 'dir' : attributes.mime, path + '/' + file, attributes.modification, hasIcon, hasIcon ? attributes.icon_version : 0))) +
		'&quot;) center center/contain no-repeat;"></div><div class="cut-text">' + escapeHtml(file) + '</div></div>';
		filesNumber++;
	}
	$('#' + container).append(content + '</div>');
	return filesNumber;
}

/**
 * Mark a folder as hidden or not
 * @param {*} path The path of the folder
 * @param {*} hide Should we hide the file?
 */
function hideFolder(path, hide) {
	if (!path.endsWith('/')) {
		path += '/';
	}
	if (hide) {
		// Create the meta file to mark as hidden folder
		Api.apiRequest('files', 'create-file', {'file': path + '.meta/hide'}, r => {
			// Check for errors
			if (typeof r.error !== 'undefined') {
				closePopup();
				notifError('{JS:L:CANNOT_HIDE_FILE}', '{JS:L:ERROR}');
				return;
			}
			// Display success
			notif('{JS:L:FILE_HIDDEN}');
			// Refresh file list
			displayPrivateFileList('content', getPathFromHash(), layoutType);
		});
	} else {
		// Removes the meta file
		Api.apiRequest('files', 'delete', {'path': path + '.meta/hide', 'skip-trash': '1'}, r => {
			// Check for errors
			if (typeof r.error !== 'undefined') {
				closePopup();
				notifError('{JS:L:CANNOT_UNHIDE_FILE}', '{JS:L:ERROR}');
				return;
			}
			// Display success
			notif('{JS:L:FILE_SHOWN}');
			// Refresh file list
			displayPrivateFileList('content', getPathFromHash(), layoutType);
		});
	}
}

/**
 * Display the popup to manage a file sharing
 * @param {*} file The file to manage
 * @param {*} publicShare Is this share a public file share (when private files is disabled, optional, default is false)
 */
function manageSharing(file, publicShare=false) {
	// Call the API to get informations about the file
	Api.apiRequest('files', 'get-share-status', {'file': file}, r => {
		// Check for errors
		if (typeof r.error !== 'undefined' && (typeof r.sharing_allowed === 'undefined' || !r.sharing_allowed)) {
			closePopup();
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Check if we must display the sharing popup
		if (typeof r.sharing_allowed !== 'undefined' && r.sharing_allowed && !publicShare) {
			popup('{JS:L:SHARE_THIS_FILE}', '{JS:L:SHARE_EXPLAIN}<br /><br /><button class="btn btn-outline-dark ms-2 mt-2" onclick="shareFile(\'' + escapeHtmlProperty(file, true) + '\');">{JS:L:SHARE}</button>' +
			'<button class="btn btn-outline-dark ms-2 mt-2" onclick="closePopup();">{JS:L:CANCEL}</button>');
		} else if (typeof r.error !== 'undefined' && publicShare) {
			notifError(r.error, '{JS:L:ERROR}');
		} else {
			// Display information about the shared file
			var httpBase = '{JS:S:SCHEME}://{JS:S:DOMAIN}{JS:S:DIR}';
			popup('{JS:L:SHARED_FILE}', '{JS:L:PUBLIC_URL}<input class="form-control mb-2 mt-2" style="display:inline-block;" type="text" value="' + httpBase + 'public-file/' +
			escapeHtmlProperty(r.informations.public_hash) + '" onclick="this.setSelectionRange(0,this.value.length)" readonly="" />' + ('{JS:C:files.use_shortlinks}' == '1' && r.shortlink !== false ?
			'<br />{JS:L:SHORT_LINK}<input class="form-control mb-2 mt-2" style="display:inline-block;" type="text" value="' + httpBase + escapeHtmlProperty(r.shortlink.identifier) +
			'" onclick="this.setSelectionRange(0,this.value.length)" readonly="" />' : '') + (!publicShare ? '<br />{JS:L:LOCATION}<input class="form-control mb-2 mt-2" style="display:inline-block;" type="text" ' +
			'value="' + escapeHtmlProperty(r.informations.path) + '" onclick="this.setSelectionRange(0,this.value.length)" readonly="" />' : '<br />{JS:L:MANAGE_URL}<br /><i class="lighter">{JS:L:MANAGE_URL_EXPLAIN}</i>' +
			'<input class="form-control mb-2 mt-2" style="display:inline-block;" type="text" value="' + httpBase + 'files#manage:' + escapeHtmlProperty(r.informations.path) + '" onclick="this.setSelectionRange(0,this.value.length)" readonly="" />' ) +
			'<button class="btn btn-outline-dark ms-2 mt-3" onclick="deleteShare(\'' + escapeHtmlProperty(r.informations.path, true) + '\',' + publicShare + ');">' + (publicShare ? '{JS:L:DELETE}' : '{JS:L:DELETE_SHARE}') + '</button>');
		}
	});
}

/**
 * Promt user to stop to share a file
 * @param {*} file The file to stop sharing
 * @param {*} publicShare Is this share a public file share (when private files is disabled, optional, default is false)
 */
function deleteShare(file, publicShare=false) {
	popup(publicShare ? '{JS:L:DELETE}' : '{JS:L:DELETE_SHARE}', (publicShare ? '{JS:L:CONFIRM_DELETE_PUBLIC_SHARE}' : '{JS:L:CONFIRM_DELETE_SHARE}') + '<br /><br />' +
	'<button class="btn btn-outline-dark ms-2 mt-2" onclick="doDeleteShare(\'' + escapeHtmlProperty(file, true) + '\',' + !publicShare + ');">{JS:L:YES}</button>' +
	'<button class="btn btn-outline-dark ms-2 mt-2" onclick="closePopup();">{JS:L:NO}</button>');
}

/**
 * Call the API to stop sharing a file
 * @param {*} file The file to stop sharing
 * @param {*} refreshList Should we refresh the private file list (optional, default is true)
 */
function doDeleteShare(file, refreshList=true) {
	Api.apiRequest('files', 'stop-sharing', {'file': file}, r => {
		// Close popup
		closePopup();
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Display success
		notif(r.message);
		if (refreshList) {
			// Refresh file list
			displayPrivateFileList('content', getPathFromHash(), layoutType);
		}
	});
}

/**
 * Call the API to mage a file public
 * @param {*} file The file to share
 * @param {*} publicShare Is this share a public file share (when private files is disabled, optional, default is false)
 */
function shareFile(file, publicShare=false) {
	Api.apiRequest('files', 'share', {'file': file}, r => {
		// Check for errors
		if (typeof r.error !== 'undefined') {
			// Close popup and print error
			closePopup();
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		if (!publicShare) {
			// Refresh file list
			displayPrivateFileList('content', getPathFromHash(), layoutType, true, true);
		}
		// Display sharing informations
		manageSharing(r.clean_path, publicShare);
	});
}

/**
 * Display the popup to edit a file (rename, move, delete, copy)
 * @param {*} file The file path
 * @param {*} type The mime type of the file (or 'dir' for directories)
 * @param {*} hasIcon Does the directory has an icon
 * @param {*} hidden Is the file hidden
 */
function editFile(file, type, hasIcon, hidden) {
	var escapedFileName = escapeHtmlProperty(file, true);
	popup(escapeHtml(getFileName(file)), '<button class="btn btn-outline-dark ms-2 mt-2" onclick="renameFile(\'' + escapedFileName + '\');">{JS:L:RENAME}</button>' +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="moveFile(\'' + escapedFileName + '\');">{JS:L:MOVE}</button>' +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="copyFile(\'' + escapedFileName + '\');">{JS:L:COPY}</button>' +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="deleteFile(\'' + escapedFileName + '\');">{JS:L:DELETE}</button>' +
		(type == 'dir' ? '<button class="btn btn-outline-dark ms-2 mt-2" onclick="hideFolder(\'' + escapedFileName + '\', ' + (hidden ? 'false' : 'true') + ');">' + (hidden ? '{JS:L:SHOW}' : '{JS:L:HIDE}') + '</button>' : '') +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="informations(\'' + escapedFileName + '\');">{JS:L:INFORMATIONS}</button>' +
		('{JS:R:files.allow_public_files}' == '1' && type != 'dir' ? '<button class="btn btn-outline-dark ms-2 mt-2" onclick="manageSharing(\'' + escapedFileName + '\');">{JS:L:MANAGE_SHARING}</button>' : '') +
		(type.startsWith('image/') ? '<button class="btn btn-outline-dark ms-2 mt-2" onclick="useAsIcon(\'' + escapedFileName + '\');">{JS:L:USE_AS_ICON}</button>' : '') +
		(type == 'dir' && (hasIcon || Object.keys(specialFolders).includes(file)) ? '<button class="btn btn-outline-dark ms-2 mt-2" onclick="resetIcon(\'' + escapedFileName + '\');">{JS:L:RESET_ICON}</button>' : '') +
		(type == 'dir' ? '<button class="btn btn-outline-dark ms-2 mt-2" onclick="setIcon(\'' + escapedFileName + '\');">{JS:L:SET_ICON}</button>' : ''), true);
}

/**
 * Display the form to upload a new icon for a folder
 * @param {*} folder The folder we want to change the icon
 */
function setIcon(folder) {
	if (!folder.endsWith('/')) {
		folder += '/';
	}
	popup('{JS:L:SET_ICON}', '<div id="set-icon"></div>', true);
	appendFileUpload('set-icon', folder + '.meta/', false, r => {
		closePopup();
		let clean_path = r.clean_path;
		// Check mime type
		if (!r.mime.startsWith('image/')) {
			// Delete file
			Api.apiRequest('files', 'delete', {'path': clean_path, 'skip-trash': '1'}, r => {});
			// Display an error
			notifError('{JS:L:NOT_IMAGE}', '{JS:L:ERROR}');
			return;
		}
		// Delete current icon if exists
		Api.apiRequest('files', 'delete', {'path': folder + '.meta/icon', 'skip-trash': '1'}, r => {
			// Check for errors
			if (typeof r.error !== 'undefined' && r.error != '{JS:L:FILE_NOT_FOUND}') {
				// Delete file
				Api.apiRequest('files', 'delete', {'path': clean_path, 'skip-trash': '1'}, r => {});
				// Display error
				notifError('{JS:L:CANNOT_DELETE_CURRENT_ICON}<br /><br /><i>' + r.error + '</i>', '{JS:L:ERROR}');
				return;
			}
			// Move the image to be the icon
			Api.apiRequest('files', 'rename', {'path': folder + '.meta', 'old_name': clean_path.split('/').pop(), 'new_name': 'icon'}, r => {
				// Check for errors
				if (typeof r.error !== 'undefined') {
					// Delete file
					Api.apiRequest('files', 'delete', {'path': clean_path, 'skip-trash': '1'}, r => {});
					// Display error
					notifError('{JS:L:CANNOT_SET_ICON}<br /><br /><i>' + r.error + '</i>', '{JS:L:ERROR}');
					return;
				}
				// Display success
				notif('{JS:L:ICON_SET}');
				// Refresh file list
				displayPrivateFileList('content', getPathFromHash(), layoutType);
			})
		});
	});
}

/**
 * Remove the icon of a folder
 * @param {*} folder The folder we want to reset the icon
 */
function resetIcon(folder) {
	Api.apiRequest('files', 'delete', {'path': folder + '/.meta/icon', 'skip-trash': '1'}, r => {

		// Close popup
		closePopup();

		// Check for errors
		if (typeof r.error !== 'undefined' && r.error != '{JS:L:FILE_NOT_FOUND}') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}

		// Check if we try to restore a special folder icon
		if (Object.keys(specialFolders).includes(folder)) {

			// Try to copy special icon from backup
			Api.apiRequest('files', 'copy', {'file': '/icons_backup/' + specialFolders[folder] + '.svg', 'new_path': folder + '/.meta', 'new_name': 'icon'}, r => {
				if (typeof r.error !== 'undefined') {
					notifError(r.error, '{JS:L:ERROR}');
					return;
				}
				// Display success
				notif('{JS:L:ICON_RESET}');
				// Refresh file list
				displayPrivateFileList('content', getPathFromHash(), layoutType);
			});

		} else {

			// Display success
			notif('{JS:L:ICON_RESET}');
			// Refresh file list
			displayPrivateFileList('content', getPathFromHash(), layoutType);

		}
	});
}

/**
 * Defines an image as its parent's icon
 * @param {*} file The file to use as icon
 */
function useAsIcon(file) {
	// Delete current icon if needed
	Api.apiRequest('files', 'delete', {'path': getParentDirectory(file) + '/.meta/icon'}, _ => {
		// Copy new icon
		Api.apiRequest('files', 'copy', {'file': file, 'new_path': getParentDirectory(file) + '/.meta', 'new_name': 'icon'}, r => {
			// Close popup
			closePopup();
			// Check for errors
			if (typeof r.error !== 'undefined') {
				notifError(r.error, '{JS:L:ERROR}');
				return;
			}
			// Display success
			notif('{JS:L:ICON_DEFINED}');
			// Refresh file list
			displayPrivateFileList('content', getPathFromHash(), layoutType);
		});
	});
}

/**
 * Display the confirmation to empty the trash
 */
function emptyTrash() {
	popup('{JS:L:EMPTY_TRASH}', '{JS:L:CONFIRM_EMPTY_TRASH}<br /><br />' +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="doEmptyTrash();">{JS:L:YES}</button>' +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="closePopup();">{JS:L:NO}</button>');
}

/**
 * Call the API to empty the trash
 */
function doEmptyTrash() {
	Api.apiRequest('files', 'empty-trash', {}, r => {
		// Close popup
		closePopup();
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Display success
		notif(r.message);
		// Refresh file list
		displayPrivateFileList('content', getPathFromHash(), layoutType);
	});
}

/**
 * Display the confirmations for restoring a trashed file
 * @param {*} fileId The trashed file id
 */
function restoreFile(fileId) {
	popup('{JS:L:RESTORE}', '{JS:L:CONFIRM_RESTORE}<br /><br />' +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="doRestoreFile(\'' + escapeHtmlProperty(fileId, true) + '\');">{JS:L:YES}</button>' +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="closePopup();">{JS:L:NO}</button>');
}

/**
 * Call the API to restore a file
 * @param {*} fileId The file id to restore
 */
function doRestoreFile(fileId) {
	Api.apiRequest('files', 'restore', {'id': fileId}, r => {
		// Close popup
		closePopup();
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Display success
		notif(r.message);
		// Refresh file list
		displayPrivateFileList('content', getPathFromHash(), layoutType);
	});
}

/**
 * Display the confirmation for deleting a file
 * @param {*} file The file to delete
 * @param {*} fromTrash Are we trying to remove a file from the trash? (optional, default is false)
 */
function deleteFile(file, fromTrash=false) {
	popup('{JS:L:DELETE}', (('{JS:R:files.use_trash}' == '1' && !fromTrash) ? '{JS:L:CONFIRM_TRASH}' : '{JS:L:CONFIRM_DELETE}') + '<br /><br />' +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="doDeleteFile(\'' + escapeHtmlProperty(file, true) + '\', ' + (fromTrash ? 'true': 'false') + ');">{JS:L:YES}</button>' +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="closePopup();">{JS:L:NO}</button>');
}

/**
 * Call the API to delete/trash a file
 * @param {*} file The file to delete
 * @param {*} fromTrash Are we trying to remove a file from the trash? (optional, default is false)
 */
function doDeleteFile(file, fromTrash=false) {
	Api.apiRequest('files', 'delete', {'path': file, 'from_trash': fromTrash}, r => {
		// Close popup
		closePopup();
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Display success
		notif(r.message);
		// Refresh file list
		displayPrivateFileList('content', getPathFromHash(), layoutType);
	});
}

/**
 * Display informations about a file
 * @param {*} file The file path
 */
function informations(file) {
	Api.apiRequest('files', 'file-data', {'path': file}, r => {
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		var informations = '';
		if (r.data.type == 'file') {
			informations = '<table><tr><td class="lighter">{JS:L:NAME}</td><td class="ps-4">' + escapeHtml(getFileName(r.clean_path)) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:PATH}</td><td class="ps-4">' + escapeHtml(getParentDirectory(r.clean_path)) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:SIZE}</td><td class="ps-4">' + humanFileSize(r.data.size) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:TYPE}</td><td class="ps-4">' + escapeHtml(getType(r.data.mime)) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:CREATION}</td><td class="ps-4">' + escapeHtml(r.data.formatted_creation) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:MODIFICATION}</td><td class="ps-4">' + escapeHtml(r.data.formatted_modification) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:ACCESS}</td><td class="ps-4">' + escapeHtml(r.data.formatted_access) + '</td></tr>' +
				'</table>';
		} else {
			informations = '<table><tr><td class="lighter">{JS:L:NAME}</td><td class="ps-4">' + escapeHtml(getFileName(r.clean_path)) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:PATH}</td><td class="ps-4">' + escapeHtml(getParentDirectory(r.clean_path)) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:CHILD}</td><td class="ps-4">' + r.data.child + ' {JS:L:ELEMENTS}</td></tr>' +
				'<tr><td class="lighter">{JS:L:CREATION}</td><td class="ps-4">' + escapeHtml(r.data.formatted_creation) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:MODIFICATION}</td><td class="ps-4">' + escapeHtml(r.data.formatted_modification) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:ACCESS}</td><td class="ps-4">' + escapeHtml(r.data.formatted_access) + '</td></tr>' +
				'</table>';
		}
		// Display informations
		popup('{JS:L:INFORMATIONS}', informations);
	})
}

/**
 * Display the popup to move a file
 * @param {*} file The file to move
 */
function moveFile(file) {
	directorySelector('{JS:L:MOVE_TO}', getParentDirectory(file), '{JS:L:MOVE}', (newPath, _) => {
		let parent = getParentDirectory(file);
		// Call the Api to move the file
		Api.apiRequest('files', 'move', {'file': file, 'new_path': newPath}, r => {
			// Check for errors
			if (typeof r.error !== 'undefined') {
				notifError(r.error, '{JS:L:ERROR}');
				return;
			}
			// Refresh file list
			displayPrivateFileList('content', parent, layoutType);
			// Close the popup
			closePopup();
			// Display confirmation
			notif('{JS:L:FILE_MOVED}');
		});
	});
}

/**
 * Display the popup to copy a file
 * @param {*} file The file to copy
 */
function copyFile(file) {
	// Display the directory and name selector
	let parent = getParentDirectory(file);
	directorySelector('{JS:L:COPY_TO}', parent, '{JS:L:PASTE}', (newPath, newName) => {
		// Call the Api to copy dir
		Api.apiRequest('files', 'copy', {'file': file, 'new_path': newPath, 'new_name': newName}, r => {
			// Check for errors
			if (typeof r.error !== 'undefined') {
				notifError(r.error, '{JS:L:ERROR}');
				return;
			}
			// Refresh file list
			displayPrivateFileList('content', parent, layoutType);
			// Close the popup
			closePopup();
			// Display confirmation
			notif('{JS:L:FILE_COPIED}');
		});
	}, getFileName(file));
}

/**
 * Displays the popup to rename a file
 * @param {*} file The file path to rename
 */
function renameFile(file) {
	var renameFunc = 'doRenameFile(\'' + escapeHtmlProperty(getParentDirectory(file), true) + '\', \'' + escapeHtmlProperty(getFileName(file), true) + '\',$(\'#file-new-name\').val());';
	popup('{JS:L:RENAME}', '<input type="text" id="file-new-name" style="width:100%;display:inline-block;" class="form-control" value="' + escapeHtmlProperty(getFileName(file)) +'" onkeyup="if(event.key===\'Enter\'){' + renameFunc + '}" />' +
		'<div class="btn ms-2 mt-2 me-2 pt-1 pb-1 btn-light" style="vertical-align:baseline;" role="button" aria-pressed="true" onclick="' + renameFunc + '">{JS:L:RENAME}</div>');
	$('#file-new-name').focus();
}

/**
 * Call the API to rename a file
 * @param {*} file 
 */
function doRenameFile(path, oldName, newName) {
	Api.apiRequest('files', 'rename', {'path': path, 'old_name': oldName, 'new_name': newName}, r => {
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Refresh file list
		displayPrivateFileList('content', path, layoutType);
		// Close the popup
		closePopup();
	});
}

/**
 * Display the directory selector
 * @param {*} title The selector title
 * @param {*} path The current path
 * @param {*} button The validation button text
 * @param {*} callback The function called on validation (the selected path will be passed as parameter)
 * @param {*} input The default input value (optional, default is false to hide input)
 */
function directorySelector(title, path, button, callback, input=false) {
	// Get the file list
	Api.apiRequest('files', 'list-files', {'path': path}, r => {

		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}

		// Create the popup
		popup(title, '<div id="directory-selector"></div><div id="sub-dirs"></div>' +
			(input !== false ? '<input type="text" id="directory-selector-input" style="width:100%;display:inline-block;" class="form-control mt-2" value="' + escapeHtmlProperty(input) +
			'" onkeyup="if(event.key===\'Enter\'){$(\'#popup-button\').trigger(\'click\');}">' : '') + '<button class="btn btn-outline-dark ms-2 mt-2" id="popup-button">' + escapeHtml(button) + '</button>');

		// Prepare the button
		$('#popup-button').on('click', () => callback(r.clean_path, $('#directory-selector-input').val()));

		// Prepare the path
		let buildingPath = '';
		$('#directory-selector').append('&gt;')
		r.clean_path.split('/').forEach(dir => {
			if (dir) {
				buildingPath += '/' + dir;
			}
			let path = buildingPath;
			$('#directory-selector').append(getInlineButton(dir || '{JS:L:MY_FILES}', () => {directorySelector(title, path, button, callback, input === false ? false : $('#directory-selector-input').val());}));
			$('#directory-selector').append('/');
		});

		// Filter only the directories
		for (const [file, attributes] of Object.entries(r.files)) {
			if (attributes.type == 'dir' && (!attributes.hidden || showHidden)) {
				$('#sub-dirs').append(getInlineButton(file, () => {directorySelector(title, r.clean_path + '/' + file, button, callback, input === false ? false : $('#directory-selector-input').val());}, 'mb-2'));
			}
		}
		// Check if empty
		if ($('#sub-dirs').html() == '') {
			$('#sub-dirs').html('<i class="lighter">{JS:L:EMPTY_DIRECTORY}</i>')
		}

	});
}

/**
 * Display the storage usage of the user
 * @param {*} container The id of the element where we will append the usage
 * @param {*} usage The current disk usage of the user in bytes
 * @param {*} quota The maximum usage allowed for the user
 */
function displayQuota(container, usage, quota) {
	$('#' + container).append('<span class="' + (quota == 0 || usage <= quota ? 'lighter' : 'error') + '">{JS:L:USAGE}' + humanFileSize(usage) + ' / ' + (quota == 0 ? '&infin;' : humanFileSize(quota)) +
	(quota != 0 ? ('<span class="ms-2">(' + Math.floor(usage / quota * 100) + '%)</span>') : '') + '</span><span class="lighter"> &nbsp;&ndash;&nbsp; {JS:L:MAX_UPLOAD}' + humanFileSize('{JS:S:MAX_UPLOAD}') +
	(('{JS:R:files.allow_public_files}' == '1' && '{JS:R:files.list_public_files}' == '1') ? ' &nbsp;&ndash;&nbsp; <span onclick="showPublicFiles();" style="cursor:pointer;">{JS:L:PUBLIC_FILES}</span>' : '') +
	(' &nbsp;&ndash;&nbsp; <span id="toggle-hidden" onclick="toggleHidden();" style="cursor:pointer;">' + (showHidden ? '{JS:L:HIDE_HIDDEN_FILES}' : '{JS:L:SHOW_HIDDEN_FILES}') + '</span>') +
	('{JS:R:files.use_trash}' == '1' ? ' &nbsp;&ndash;&nbsp; <span onclick="showTrash();" style="cursor:pointer;">{JS:L:TRASH}</span>' : '') + '</span>');
}

/**
 * Toggle hidden files display
 */
function toggleHidden() {
	showHidden = !showHidden;
	localStorage.setItem('files.show_hidden', showHidden ? '1' : '0');
	// Refresh file list
	displayPrivateFileList('content', getPathFromHash(), layoutType, true);
}

/**
 * Return the current path from the page hash
 * @returns The current path
 */
function getPathFromHash() {
	return location.hash.substr(0, 1) == '#' ? location.hash.substr(1) : location.hash;
}

/**
 * Display the list of the files in the trash
 */
function showTrash() {
	Api.apiRequest('files', 'list-trash', {}, r => {
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Display the list
		var filesNumber = Object.keys(r.files).length;
		if (filesNumber > 0) {
			var list = '<table><tr class="lighter"><th class="p-2">{JS:L:NAME}</th><th class="p-2">{JS:L:SIZE}</th><th class="p-2">{JS:L:TYPE}</th><th class="p-2">{JS:L:DELETE_DATE}</th><th class="p-2">{JS:L:ACTIONS}</th></tr>';
			for (const [trash_id, attributes] of Object.entries(r.files)) {
				var escapedId = escapeHtmlProperty(trash_id, true);
				list += '<tr style="border-top:1px solid #D0D0D0;" class="p-2"><td class="p-2">' + escapeHtml(attributes.path) + '</td><td class="p-2">' + humanFileSize(attributes.size) + '</td><td class="p-2">' +
				escapeHtml(attributes.type == 'dir' ? '{JS:L:DIR}' : '{JS:L:FILE}') + '</td><td class="p-2">' + escapeHtml(attributes.formatted_deleted) + '</td><td class="p-2">' +
				'<div onclick="restoreFile(\'' + escapedId + '\');" class="btn pt-0 pb-0 ps-1 pe-1 ms-1 me-1 btn-light" style="vertical-align: baseline;" role="button" aria-pressed="true">{JS:L:RESTORE}</div>' +
				'<div onclick="deleteFile(\'' + escapedId + '\', true);" class="btn pt-0 pb-0 ps-1 pe-1 ms-1 me-1 btn-light" style="vertical-align: baseline;" role="button" aria-pressed="true">{JS:L:DELETE}</div></td></tr>';
			}
		} else {
			list = '<i class="lighter m-5">{JS:L:TRASH_IS_EMPTY}<i>';
		}
		popup('{JS:L:TRASH}' + (filesNumber > 0 ? (' (' + humanFileSize(r.size) + ') <div onclick="emptyTrash();" class="btn pt-0 pb-0 ps-1 pe-1 ms-1 me-1 btn-light" style="vertical-align: baseline;" role="button" aria-pressed="true">{JS:L:EMPTY}</div>') : ''), list + '</table>');
	});
}

/**
 * Display the list of the public files
 * @param {*} isPublic Are we displaying only for public view (optional, default is false)
 */
function showPublicFiles(isPublic=false) {
	Api.apiRequest('files', 'list-public', {}, r => {
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Display the list
		var filesNumber = Object.keys(r.files).length;
		if (filesNumber > 0) {
			var list = '<table><tr class="lighter"><th class="p-2">{JS:L:NAME}</th><th class="p-2">{JS:L:ACTIONS}</th></tr>';
			for (const file of r.files) {
				var escapedFile = escapeHtmlProperty(file, true);
				list += '<tr style="border-top:1px solid #D0D0D0;" class="p-2"><td class="p-2">' + escapeHtml(file) + '</td><td class="p-2">' +
				'<div onclick="manageSharing(\'' + escapedFile + '\',' + isPublic + ');" class="btn pt-0 pb-0 ps-1 pe-1 ms-1 me-1 btn-light" style="vertical-align: baseline;" role="button" aria-pressed="true">{JS:L:MANAGE_SHARING}</div>' +
				'<div onclick="deleteShare(\'' + escapedFile + '\',' + isPublic + ');" class="btn pt-0 pb-0 ps-1 pe-1 ms-1 me-1 btn-light" style="vertical-align: baseline;" role="button" aria-pressed="true">{JS:L:DELETE_SHARE}</div></td></tr>';
			}
		} else {
			list = '<i class="lighter m-5">{JS:L:NO_SHARES}<i>';
		}
		popup('{JS:L:PUBLIC_FILES}', list + '</table>');
	});
}

/**
 * Return the icon URL for a mime type
 * 
 * @param {*} mime The mime type of the file or 'dir' if it's a directory
 * @param {*} file The file to get icon
 * @param {*} version The version of the file
 * @param {*} hasIcon For folders only, indicates if the directory has a special icon (optional, default is false)
 * @param {*} iconVersion For folders only, the version of the icon image (optinal, default is 0)
 * @return The URL of the icon
 */
function getIcon(mime, file, version, hasIcon=false, iconVersion=0) {
	// Check if directory
	if (mime == 'dir') {
		if (hasIcon) {
			return '{JS:S:DIR}private-file' + file + '/.meta/icon?v=' + iconVersion + '&s=200';
		} else {
			return '{JS:S:DIR}media/files/icons/folder.svg';
		}
	}
	// Special types
	if (mime == 'application/json') {
		mime = 'text/plain';
	}
	// Get first part
	if (mime.includes('/')) {
		var type = mime.split('/')[0];
		if (type == 'image' && '{JS:C:files.images_preview}' == '1') {
			return '{JS:S:DIR}private-file' + file + '?v=' + version + '&s=200';
		}
		if (['audio', 'font', 'video', 'image', 'text'].includes(type)) {
			return '{JS:S:DIR}media/files/icons/' + type + '.svg';
		} else if (['application/x-bzip', 'application/x-bzip2', 'application/java-archive', 'application/x-rar-compressed',
			'application/x-tar', 'application/zip', 'application/x-7z-compressed'].includes(mime)) {
			return '{JS:S:DIR}media/files/icons/archive.svg';
		}
		return '{JS:S:DIR}media/files/icons/unknown.svg';
	} else {
		return '{JS:S:DIR}media/files/icons/unknown.svg';
	}
}

/**
 * Return the file type based on its mime type
 * 
 * @param {*} mime The mime type
 * @return The file type in the user's language
 */
function getType(mime) {
	if (typeof mimeTypes[mime] === 'undefined') {
		return '{JS:L:UNKNOWN}';
	}
	return mimeTypes[mime];
}

/**
 * Filter an object
 * @param {*} obj The object to filter
 * @param {*} callback The filter function
 * @returns The filtered object
 */
function filterObject(obj, callback) {
	return Object.fromEntries(Object.entries(obj).filter(([key, val]) => callback(key, val)));
}

/**
 * Displays the preview for a private file
 * 
 * @param {*} file The data about the file
 * @param {*} path The path of the file
 */
function previewPrivateFile(file, path) {

	// Get the parent directory
	let parent = getParentDirectory(path), fileName = getFileName(path);
	
	// If file is an image
	if (file.mime.startsWith('image/')) {

		// Close other previews
		closePopup();

		// Display the image viewer
		$('#image-view').attr('src', '');
		$('#image-loader').show();
		$('#image-view').attr('src', '{JS:S:DIR}private-file' + path + '?v=' + file.modification).on('load', () => {$('#image-loader').hide();});
		$('#image-viewer').show();

		// Set the next and previous buttons
		Api.apiRequest('files', 'list-files', {'path': parent}, r => {
			// Check for errors
			if (typeof r.error !== 'undefined') {
				notifError(r.error, '{JS:L:ERROR}');
				return;
			}
			// Filter only the images to get next and previous
			var images = Object.keys(filterObject(r.files, (key, value) => value.type == 'file' && value.mime.startsWith('image/')));
			// Set buttons link
			$('#image-prev').attr('href', '#' + parent + images[(images.indexOf(fileName) - 1).mod(images.length)]);
			$('#image-next').attr('href', '#' + parent + images[(images.indexOf(fileName) + 1).mod(images.length)]);
		});

		// Set key binding
		document.onkeydown = function(e) {
			if (e.key == 'ArrowLeft') {
				location.href = $('#image-prev').attr('href');
			} else if (e.key == 'ArrowRight') {
				location.href = $('#image-next').attr('href');
			} else {
				return;
			}
			e.preventDefault();
		};

		// Set the "close" url
		$('#image-viewer').on('click', (e) => {e.target.classList.contains('prevent-close') ? null : location.href = '#' + parent;});

	}

	// If file is a text
	else if (file.mime.startsWith('text/') || file.mime == 'application/json') {

		// Close other previews
		closeImagePreview();

		// Get the content of the file
		var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {

				// Display the editor in the popup
				popup(getFileName(path), '<textarea id="text-content" class="prevent-close" spellcheck="true"></textarea>', false, closeTextEditor);
				
				// Set the text
                $('#text-content').val(this.responseText);
				lastFileContent = $('#text-content').val(); // We use the textarea content and not the original on purpose because it can create differences with line break encoding
				lastFile = path;

				// Add buttons for text edit
				$(getInlineButton('{JS:L:SAVE}', () => saveTextFile(lastFile, $('#text-content').val()))).insertBefore('#popup-title img');
				$(getInlineButton('{JS:L:CODE}', (e) => {
					// Toggle code/text mode
					$('#text-content').toggleClass('code');
					$(e.target).html($('#text-content')[0].classList.contains('code') ? '{JS:L:TEXT}' : '{JS:L:CODE}');
					// Disable spell check
					$('#text-content').attr('spellcheck', $('#text-content').attr('spellcheck') == 'true' ? 'false' : 'true');
				})).insertBefore('#popup-title img');

			}
        };
        xhttp.open('GET', '{JS:S:DIR}private-file' + path + '?v=' + file.modification, true);
        xhttp.send();

	}

	// If mime type is not supported
	else {

		// We just open it in a new window
		window.open('{JS:S:DIR}private-file' + path + '?v=' + file.modification, '_blank').focus();

		// And go back to file list
		location.href = '#' + parent;

	}

}

/**
 * Close the image preview
 */
function closeImagePreview() {
	// Hide the viewer
	$('#image-viewer').hide();
	$('#image-view').attr('src', '');
	document.onkeydown = null;
}

/**
 * Close the text editor
 * Warning: Should not be called directly, use "closePopup" instead
 */
function closeTextEditor() {
	// Check if editor is opened
	if ($('#text-content').is(":visible")) {
		// Display a confirmation if needed
		let newContent = $('#text-content').val();
		if (newContent != lastFileContent) {
			promptChoice('{JS:L:FILE_NOT_SAVED}', '{JS:L:YES}', '{JS:L:NO}', () => {
				saveTextFile(lastFile, newContent, true);
			}, () => {}, '{JS:L:WARNING}');
		}
		// Display edited parent only if the hash is still the file
		// That means we are closing the popup and not browsing a new file
		var hash = getPathFromHash();
		if (decodeURIComponent(hash) == lastFile) {
			location.href = '#' + getParentDirectory(lastFile);
		}
	}
}

/**
 * Saves a text file
 * @param {*} path The file path to save
 * @param {*} content The content of the file
 * @param {*} refresh Should we refresh the file list (optional, default is false)
 */
function saveTextFile(path, content, refresh=false) {
	Api.apiRequest('files', 'update-text-file', {'path': path, 'content': content}, r => {
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		// Save last version localy
		lastFileContent = content;
		// Display success message
		notif('{JS:L:FILE_SAVED}');
		// Refresh list
		if (refresh) {
			displayPrivateFileList('content', getParentDirectory(path), layoutType);
		}
	});
}

/**
 * Return the parent directory for a given file/dir
 * @param {*} path The path we want to get the parent
 * @return The parent directory
 */
function getParentDirectory(path) {
	path = path.replaceAll('\\', '/');
	if (path.endsWith('/')) {
		path = path.substr(0, path.length - 1);
	}
	return path.split('/').slice(0, -1).join('/') + '/';
}

/**
 * Return the file name from a given path
 * @param {*} path The path to get
 * @return The file name
 */
function getFileName(path) {
	path = path.replaceAll('\\', '/');
	if (path.endsWith('/')) {
		path = path.substr(0, path.length - 1);
	}
	return path.split('/').pop();
}

/**
 * Format bytes as human-readable text.
 * 
 * @source https://stackoverflow.com/a/14919494
 * 
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use 
 *           binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 * 
 * @return Formatted string.
 */
function humanFileSize(bytes, si=false, dp=1) {
	const thresh = si ? 1000 : 1024;
	if (Math.abs(bytes) < thresh) {
		return bytes + ' {JS:L:BYTE_UNIT}' ;
	}
	const units = si 
		? '{JS:L:SI_UNITS}'.split(',')
		: '{JS:L:IEC_UNITS}'.split(',');
	let u = -1;
	const r = 10**dp;
	do {
		bytes /= thresh;
		++u;
	} while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
	return bytes.toFixed(dp) + ' ' + units[u];
}

/**
 * Prepare the file uploader
 * @param {*} container The id of the element that will contains the uploader
 * @param {*} path The current path
 * @param {*} publicUpload Are we trying to upload a file in public mode (optional, default is false)
 * @param {*} successCallback A function to call on success instead of performing normal steps (response will be passed as an argument)
 */
function appendFileUpload(container, path, publicUpload=false, successCallback=null) {
	// Enable file upload
	createFileUpload(container, 'user_file', '{JS:L:UPLOAD}', '{JS:S:DIR}api/files/upload', (xhr, status) => {
		// Check for file too large error
		if (xhr.status == 413) {
			notifError('{JS:L:FILE_TOO_LARGE}', '{JS:L:ERROR}');
			return;
		}
		// Parse JSON
		try {
			r = JSON.parse(xhr.responseText);
		} catch (e) {
			notifError('{JS:L:UNKNOWN_ERROR}<br /><code style="color:white;">' + e + '</code>', '{JS:L:ERROR}');
			return;
		}
		// Check for status error
		if (status !== "success") {
			notifError('{JS:L:NETWORK_ERROR}', '{JS:L:ERROR}');
			return;
		}
		// Check for errors
		if (typeof r.error !== 'undefined') {
			notifError(r.error, '{JS:L:ERROR}');
			return;
		}
		if (successCallback !== null) {
			successCallback(r);
			return;
		}
		if (!publicUpload) {
			// Display message
			notif('{JS:L:FILE_UPLOADED}');
			// Refresh files list
			displayPrivateFileList('content', path, layoutType);
		} else {
			// If public upload, we create the public sharing
			shareFile(r.clean_path, true);
		}
	}, publicUpload ? {'public_upload': true} : {'path': path});
}

/**
 * Display the form to upload public files
 * @param {*} container The container element id
 */
function displayPublicFileUploader(container) {
	// Add the file uploader
	$('#' + container).removeClass('text-start').append('<h4 class="pt-5 pb-4">{JS:L:UPLOAD_PUBLIC_FILE}</h4><div id="file-upload" class="mt-3 mb-4"></div>');
	appendFileUpload('file-upload', '/', true);
	$('#' + container).append('<span class="lighter">{JS:L:MAX_UPLOAD}' + humanFileSize('{JS:S:MAX_UPLOAD}') + '</span>');
	// Check if we must display link to view public files list
	if ('{JS:R:files.list_public_files}' == '1') {
		$('#' + container).append('<span class="lighter"> &nbsp;&ndash;&nbsp; </span><span class="lighter" style="cursor:pointer;" onclick="showPublicFiles(true);">{JS:L:PUBLIC_FILES}</span>');
	}
}

// Init some elements
window.onload = function() {

	// Enable indentation support for text editor
	enableIndentation();

	// Check if we can display files list
	if ('{JS:R:files.allow_private_files}' == '1') {
		// Get path if needed
		var path = '/';
		if (location.hash) {
			path = location.hash.substr(1);
		}
		// Display private files list
		displayPrivateFileList('content', path, layoutType);
		// Listen hash change
		window.addEventListener('hashchange', (e) => {
			// Get the hash
			var hash = getPathFromHash();
			// Update the display and scroll to top
			displayPrivateFileList('content', hash, layoutType, !preventRescroll);
			preventRescroll = false;
		}, false);
	} else if ('{JS:R:files.allow_public_files}' == '1') {
		// If only public files is allowed
		displayPublicFileUploader('content');
		// Get the hash
		var hash = getPathFromHash();
		// Check if we must display manage page
		if (hash.startsWith('manage:')) {
			manageSharing(decodeURIComponent(hash.substring(7)), true);
		}
	} else {
		// If nothing allowed, display an error
		$('#content').removeClass('text-start').html('<h3 class="lighter pt-5">{JS:L:CANNOT_USE_MODULE}</h3>');
	}
	
}