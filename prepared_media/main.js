// The last version of the file (to detect if file has changed)
let lastFileContent = '', lastFile = '';

// The current layout type
let layoutType = localStorage.getItem('files.layout') || 'grid';

// Global variable to prevent rescroll on list update
let preventRescroll = false;

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
 * @param {*} reScroll Save the scroll after re-draw
 */
function displayPrivateFileList(container, path, layout='list', reScroll=true) {
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
		closeTextEditor();
		// Save the scroll to restore it in case of a refresh
		var scroll = [window.scrollX, window.scrollY];
		// Display current dir
		$('#' + container).html('');
		displayCurrentDir(container, r.clean_path);
		// Display
		if (layout == 'list') {
			renderLayoutList(container, r.clean_path, r.files);
		} else if (layout == 'grid') {
			renderLayoutGrid(container, r.clean_path, r.files);
		} else {
			notifError('{JS:L:UNKNOWN_LAYOUT}', '{JS:L:ERROR}');
		}
		// Check if empty
		if (Object.keys(r.files).length == 0) {
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
	displayPrivateFileList('content', location.hash.substr(0, 1) == '#' ? location.hash.substr(1) : location.hash, layoutType);
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
 */
function renderLayoutList(container, path, files) {
	// Display the files
	var content = '<table class="w-100 table-layout-fixed"><tr><th class="pb-2 w-30">{JS:L:FILE}</th><th class="pb-2 w-20 hidden-mobile">{JS:L:TYPE}</th><th class="pb-2 w-20 hidden-mobile">{JS:L:SIZE} / {JS:L:CHILD}</th></tr>';
	for (const [file, attributes] of Object.entries(files)) {
		var is_dir = attributes.type == 'dir';
		var type = is_dir ? '{JS:L:DIRECTORY}' : getType(attributes.mime);
		content += '<tr ><td class="pb-2"><span style="cursor:pointer;" class="me-2 lighter" title="{JS:L:EDIT}" onclick="editFile(\'' + escapeHtmlProperty(path, true) + '/' + escapeHtmlProperty(file, true) + '\');">&bull;&bull;&bull;</span>' +
		'<span style="cursor:pointer;" title="' + escapeHtml(file) + '" onclick="preventRescroll=true;location.href=\'#' + escapeHtmlProperty(path, true) + '/' + escapeHtmlProperty(file, true) + '\';">' +
		'<div class="me-2 list-image-bg" style="background:#fff url(' + escapeHtmlProperty(getIcon(is_dir ? 'dir' : attributes.mime, path + '/' + file, attributes.modification), true).replaceAll(/[\(\)]/g, '\\$&') + ') center center/contain no-repeat;"></div>' + escapeHtml(file) + '</span></td>' +
		'<td class="pb-2 hidden-mobile" title="' + escapeHtmlProperty(type) + '">' + type + '</td><td class="pb-2 hidden-mobile">' + (is_dir ? attributes.child + ' {JS:L:ELEMENTS}' : humanFileSize(attributes.size)) + '</td></tr>';
	}
	$('#' + container).append(content + '</table>');
}

/**
 * Displays a grid of files
 * 
 * @param {*} container The id of the parent element
 * @param {*} path The current path
 * @param {*} files The list of the files as returned by the API
 */
function renderLayoutGrid(container, path, files) {
	// Display the files
	var content = '<div id="grid-display">';
	for (const [file, attributes] of Object.entries(files)) {
		var is_dir = attributes.type == 'dir';
		content += '<div class="grid-element" title="' + escapeHtml(file) + '" onclick="preventRescroll=true;location.href=\'#' + escapeHtmlProperty(path, true) + '/' + escapeHtmlProperty(file, true) + '\';">' +
		'<span class="me-2 lighter" title="{JS:L:EDIT}" onclick="event.stopPropagation();editFile(\'' + escapeHtmlProperty(path, true) + '/' + escapeHtmlProperty(file, true) + '\');">&bull;&bull;&bull;</span>' +
		'<div class="grid-image-bg" style="background:#fff url(' + escapeHtmlProperty(getIcon(is_dir ? 'dir' : attributes.mime, path + '/' + file, attributes.modification), true).replaceAll(/[\(\)]/g, '\\$&') + ') center center/contain no-repeat;">' +
		'</div><div class="cut-text">' + escapeHtml(file) + '</div></div>';
	}
	$('#' + container).append(content + '</div>');
}

/**
 * Display the popup to edit a file (rename, move, delete, copy)
 * @param {*} file The file path
 */
function editFile(file) {
	var escapedFileName = escapeHtmlProperty(file, true);
	popup(escapeHtml(getFileName(file)), '<button class="btn btn-outline-dark ms-2 mt-2" onclick="renameFile(\'' + escapedFileName + '\');">{JS:L:RENAME}</button>' +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="moveFile(\'' + escapedFileName + '\');">{JS:L:MOVE}</button><br />' +
		'<button class="btn btn-outline-dark ms-2 mt-2" onclick="copyFile(\'' + escapedFileName + '\');">{JS:L:COPY}</button>' +
		'<button class="btn btn-outline-dark ms-2 mt-2">{JS:L:DELETE}</button><button class="btn btn-outline-dark ms-2 mt-2" onclick="informations(\'' + escapedFileName + '\');">{JS:L:INFORMATIONS}</button>', true);
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
			informations = '<table><tr><td class="lighter">{JS:L:NAME}</td><td class="ps-5">' + escapeHtml(getFileName(r.clean_path)) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:PATH}</td><td class="ps-5">' + escapeHtml(getParentDirectory(r.clean_path)) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:SIZE}</td><td class="ps-5">' + humanFileSize(r.data.size) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:TYPE}</td><td class="ps-5">' + escapeHtml(getType(r.data.mime)) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:CREATION}</td><td class="ps-5">' + escapeHtml(r.data.formatted_creation) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:MODIFICATION}</td><td class="ps-5">' + escapeHtml(r.data.formatted_modification) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:ACCESS}</td><td class="ps-5">' + escapeHtml(r.data.formatted_access) + '</td></tr>' +
				'</table>';
		} else {
			informations = '<table><tr><td class="lighter">{JS:L:NAME}</td><td class="ps-5">' + escapeHtml(getFileName(r.clean_path)) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:PATH}</td><td class="ps-5">' + escapeHtml(getParentDirectory(r.clean_path)) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:CHILD}</td><td class="ps-5">' + r.data.child + ' {JS:L:ELEMENTS}</td></tr>' +
				'<tr><td class="lighter">{JS:L:CREATION}</td><td class="ps-5">' + escapeHtml(r.data.formatted_creation) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:MODIFICATION}</td><td class="ps-5">' + escapeHtml(r.data.formatted_modification) + '</td></tr>' +
				'<tr><td class="lighter">{JS:L:ACCESS}</td><td class="ps-5">' + escapeHtml(r.data.formatted_access) + '</td></tr>' +
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
	directorySelector('{JS:L:COPY_TO}', parent, '{JS:L:COPY}', (newPath, newName) => {
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
	var escapedFileName = escapeHtmlProperty(getFileName(file));
	var renameFunc = 'doRenameFile(\'' + escapeHtmlProperty(getParentDirectory(file), true) + '\', \'' + escapedFileName + '\',$(\'#file-new-name\').val());';
	popup('{JS:L:RENAME}', '<input type="text" id="file-new-name" style="width:100%;display:inline-block;" class="form-control" value="' + escapedFileName +'" onkeyup="if(event.key===\'Enter\'){' + renameFunc + '}" />' +
		'<div class="btn ms-2 mt-2 me-2 pt-1 pb-1 btn-light" style="vertical-align:baseline;" role="button" aria-pressed="true" onclick="' + renameFunc + '">{JS:L:RENAME}</div>')
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
			(input !== false ? '<input type="text" id="directory-selector-input" style="width:100%;display:inline-block;" class="form-control mt-2" value="' + escapeHtmlProperty(input) +'" onkeyup="if(event.key===\'Enter\'){$(\'#popup-button\').trigger(\'click\');}">' : '') +
			'<button class="btn btn-outline-dark ms-2 mt-2" id="popup-button">' + escapeHtml(button) + '</button>');

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
			if (attributes.type == 'dir') {
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
	(quota != 0 ? ('<span class="ms-2">(' + Math.floor(usage / quota * 100) + '%)</span>') : '') + ' &nbsp;&ndash;&nbsp; {JS:L:MAX_UPLOAD}' + humanFileSize({S:MAX_UPLOAD}) + '</span>');
}

/**
 * Return the icon URL for a mime type
 * 
 * @param {*} mime The mime type of the file or 'dir' if it's a directory
 * @param {*} file The file to get icon
 * @param {*} version The version of the file
 * @return The URL of the icon
 */
function getIcon(mime, file, version) {
	// Check if directory
	if (mime == 'dir') {
		return '{JS:S:DIR}media/files/icons/folder.svg';
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
		closeTextEditor();

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
				// Set the text
                $('#text-content').val(this.responseText);
				lastFileContent = $('#text-content').val(); // We use the textarea content and not the original on purpose because it can create differences with line break encoding
				lastFile = path;
				// Display the text editor
				$('#text-editor').show();
            }
        };
        xhttp.open('GET', '{JS:S:DIR}private-file' + path + '?v=' + file.modification, true);
        xhttp.send();

		// Set the "close" url
		$('#text-editor').on('click', (e) => {e.target.classList.contains('prevent-close') ? null : location.href = '#' + getParentDirectory(path);});

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
 */
function closeTextEditor() {
	// Check if editor is opened
	if ($('#text-editor').is(":visible")) {
		// Display a confirmation if needed
		let newContent = $('#text-content').val();
		if (newContent != lastFileContent) {
			promptChoice('{JS:L:FILE_NOT_SAVED}', '{JS:L:YES}', '{JS:L:NO}', () => {
				saveTextFile(lastFile, newContent, true);
			}, () => {}, '{JS:L:WARNING}');
		}
		// Refresh file list
		displayPrivateFileList('content', getParentDirectory(lastFile), layoutType);
	}
	// Hide the editor
	$('#text-editor').hide();
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
 */
function appendFileUpload(container, path) {
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
		// Display message
		notif('{JS:L:FILE_UPLOADED}');
		// Refresh files list
		displayPrivateFileList('content', path, layoutType);
	}, {'path': path});
}

// Init some elements
window.onload = function() {

	// Add buttons for text edit
	$(getInlineButton('{JS:L:SAVE}', () => saveTextFile(lastFile, $('#text-content').val()), 'prevent-close')).appendTo('#text-controls');
	$(getInlineButton('{JS:L:CODE}', (e) => {
		// Toggle code/text mode
		$('#text-content').toggleClass('code');
		$(e.target).html($('#text-content')[0].classList.contains('code') ? '{JS:L:TEXT}' : '{JS:L:CODE}');
		// Disable spell check
		$('#text-content').attr('spellcheck', $('#text-content').attr('spellcheck') == 'true' ? 'false' : 'true');
	}, 'prevent-close')).appendTo('#text-controls');

	// Enable indentation support for text editor
	enableIndentation();

	// Check if we can display files list
	if ({R:files.allow_private_files}) {
		// Get path if needed
		var path = '/';
		if (location.hash) {
			path = location.hash.substr(1);
		}
		// Display private files list
		displayPrivateFileList('content', path, layoutType);
		// Listen hash change
		window.addEventListener('hashchange', (e) => {
			// Get the path
			var hash = location.hash.substr(0, 1) == '#' ? location.hash.substr(1) : location.hash;
			// Update the display and scroll to top
			displayPrivateFileList('content', hash, layoutType, !preventRescroll);
			preventRescroll = false;
		}, false);
	}
	
}