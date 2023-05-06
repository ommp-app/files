// The last version of the file (to detect if file has changed)
let lastFileContent = '', lastFile = '';

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
 */
function displayPrivateFileList(container, path, layout='list') {
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
		// Display
		if (layout == 'list') {
			renderLayoutList(container, r.clean_path, r.files);
		} else if (layout == 'grid') {
			renderLayoutGrid(container, r.clean_path, r.files);
		} else {
			notifError('{JS:L:UNKNOWN_LAYOUT}', '{JS:L:ERROR}');
		}
	});
}

/**
 * Displays the current directory with clickable links
 * 
 * @param {*} container The id of the parent element
 * @param {*} path The current path
 */
function displayCurrentDir(container, path) {
	// Split the path
	let buildingPath = '';
	$('#' + container).append('<div id="current-path">&gt;</div>');
	path.split('/').forEach(dir => {
		if (dir) {
			buildingPath += '/' + dir;
		}
		let path = buildingPath;
		$('#current-path').append(getInlineButton(dir || '{JS:L:MY_FILES}', () => {location.href = '#' + path;}));
		$('#current-path').append('/');
	});
	// Close the viewers if needed
	closeImagePreview();
	closeTextEditor();
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
	// Save the scroll to restore it in case of a refresh
	var scroll = [window.scrollX, window.scrollY];
	// Display current dir
	$('#' + container).html('');
	displayCurrentDir(container, path);
	// Display the files
	var content = '<table class="w-100 mt-3 table-layout-fixed"><tr><th class="pb-2 w-30">{JS:L:FILE}</th><th class="pb-2 w-20 hidden-mobile">{JS:L:TYPE}</th><th class="pb-2 w-20 hidden-mobile">{JS:L:SIZE} / {JS:L:CHILD}</th><th class="pb-2 w-30 hidden-mobile">{JS:L:LAST_MODIFICATION}</th></tr>';
	for (const [file, attributes] of Object.entries(files)) {
		var is_dir = attributes.type == 'dir';
		content += '<tr ><td class="pb-2"><span style="cursor:pointer;" title="' + escapeHtml(file) + '" onclick="location.href=\'#' + escapeHtmlProperty(path, true) + '/' + escapeHtmlProperty(file, true) + '\';"><img src="' + getIcon(is_dir ? 'dir' : attributes.mime) +
		'" class="me-2 inline-image-semi" style="vertical-align:bottom;" alt="" />' + escapeHtml(file) + '</span></td><td class="pb-2 hidden-mobile">' + (is_dir ? '{JS:L:DIRECTORY}' : getType(attributes.mime)) +
		'</td><td class="pb-2 hidden-mobile">' + (is_dir ? attributes.child + ' {JS:L:ELEMENTS}' : humanFileSize(attributes.size)) + '</td><td class="pb-2 hidden-mobile">' + escapeHtml(attributes.formatted_modification) + '</td></tr>';
	}
	$('#' + container).append(content + '</table>');
	// Add the file uploader
	$('#' + container).append('<div id="file-upload" class="mt-3 mb-4"></div>');
	appendFileUpload('file-upload', path);
	// Reset the scroll
	window.scrollTo({
		left: scroll[0],
		top: scroll[1],
		behavior: 'instant'
	});
}

/**
 * Return the icon URL for a mime type
 * 
 * @param {*} mime The mime type of the file or 'dir' if it's a directory
 * @return The URL of the icon
 */
function getIcon(mime) {
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
 * Format a size in bytes to a human readable
 * 
 * @param {*} size The size in bytes
 * @return The human readable format for the size
 */
function formatSize(size) {

}

/**
 * Displays a grid of files
 * 
 * @param {*} container The id of the parent element
 * @param {*} path The current path
 * @param {*} files The list of the files as returned by the API
 */
function renderLayoutGrid(container, path, files) {
	// TODO
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
		displayPrivateFileList('content', getParentDirectory(lastFile));
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
			displayPrivateFileList('content', getParentDirectory(path));
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
	
}