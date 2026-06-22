'use strict';

//----------------------------------------------------
// brainCloud client source code
// Copyright 2026 bitHeads, inc.
//----------------------------------------------------

var https = require('https');
var brainclouds2s = require('./brainclouds2s');

/**
 * S2S service for brainCloud Global File V3 operations.
 *
 * Usage:
 *   const S2S = require('./brainclouds2s');
 *   const GFV3 = require('./brainclouds2s-globalfilev3');
 *
 *   let context = S2S.init(appId, serverName, serverSecret, s2sUrl, false);
 *   S2S.authenticate(context, (ctx, result) => {
 *       GFV3.sysGetGlobalFileList(ctx, "", true, (ctx, result) => { ... });
 *   });
 *
 * File upload is a two-step process:
 *   1. SYS_PREPARE_UPLOAD is sent via the S2S dispatcher and returns an uploadId + uploadUrl.
 *   2. The file bytes are POSTed as multipart/form-data to the upload endpoint.
 */

// Default upload URL (fallback when context.url does not resolve to the upload endpoint)
var DEFAULT_UPLOAD_PATH = '/s2suploader/globalfile/upload';

// -----------------------------------------------------------------------
// File Info / Query
// -----------------------------------------------------------------------

/**
 * Returns metadata for a global file identified by its fileId.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} fileId - Unique file identifier
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysGetFileInfo = (context, fileId, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_GET_FILE_INFO',
        data: { fileId: fileId }
    }, callback);
};

/**
 * Returns metadata for a global file identified by folder path and filename.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} folderPath - Folder path (e.g. "myFolder/subFolder")
 * @param {string} filename - File name
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysGetFileInfoSimple = (context, folderPath, filename, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_GET_FILE_INFO_SIMPLE',
        data: { folderPath: folderPath, filename: filename }
    }, callback);
};

/**
 * Returns true if a file with the given name exists in the specified folder.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} folderPath - Folder path
 * @param {string} filename - File name
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysCheckFilenameExists = (context, folderPath, filename, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_CHECK_FILENAME_EXISTS',
        data: { folderPath: folderPath, filename: filename }
    }, callback);
};

/**
 * Returns true if a file exists at the given full path (e.g. "/folder/sub/file.txt").
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} fullpathFilename - Full path including filename
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysCheckFullpathFilenameExists = (context, fullpathFilename, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_CHECK_FULLPATH_FILENAME_EXISTS',
        data: { fullPathFilename: fullpathFilename }
    }, callback);
};

/**
 * Returns the CDN URL for the global file identified by fileId.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} fileId - Unique file identifier
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysGetGlobalCDNUrl = (context, fileId, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_GET_GLOBAL_CDN_URL',
        data: { fileId: fileId }
    }, callback);
};

/**
 * Lists all global files under the given folder path.
 * Pass folderPath="" and recurse=true to list the entire tree.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} folderPath - Folder path; use "" for root
 * @param {boolean} recurse - If true, list files in sub-folders as well
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysGetGlobalFileList = (context, folderPath, recurse, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_GET_GLOBAL_FILE_LIST',
        data: { folderPath: folderPath, recurse: recurse }
    }, callback);
};

// -----------------------------------------------------------------------
// File Management
// -----------------------------------------------------------------------

/**
 * Moves a file from a user's personal cloud storage into the global file system.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} userProfileId - User profile ID
 * @param {string} userCloudPath - Path in the user's cloud
 * @param {string} userCloudFilename - Filename in the user's cloud
 * @param {string} globalTreeId - Target folder tree ID
 * @param {string} globalFilename - Filename in the global file system
 * @param {boolean} overwriteIfPresent - Overwrite existing file if true
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysMoveToGlobalFile = (context, userProfileId, userCloudPath, userCloudFilename,
    globalTreeId, globalFilename, overwriteIfPresent, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_MOVE_TO_GLOBAL_FILE',
        data: {
            userProfileId: userProfileId,
            userCloudPath: userCloudPath,
            userCloudFilename: userCloudFilename,
            globalTreeId: globalTreeId,
            globalFilename: globalFilename,
            overwriteIfPresent: overwriteIfPresent
        }
    }, callback);
};

/**
 * Copies a global file to another folder, optionally with a new name.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} fileId - File to copy
 * @param {number} version - File version; pass -1 for latest
 * @param {string} newTreeId - Destination folder tree ID
 * @param {number} treeVersion - Destination tree version; pass -1 to skip check
 * @param {string} newFilename - Filename in the destination folder
 * @param {boolean} overwriteIfPresent - Overwrite existing file if true
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysCopyGlobalFile = (context, fileId, version, newTreeId, treeVersion,
    newFilename, overwriteIfPresent, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_COPY_GLOBAL_FILE',
        data: {
            fileId: fileId,
            version: version,
            newTreeId: newTreeId,
            treeVersion: treeVersion,
            newFilename: newFilename,
            overwriteIfPresent: overwriteIfPresent
        }
    }, callback);
};

/**
 * Moves a global file to another folder, optionally with a new name.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} fileId - File to move
 * @param {number} version - File version; pass -1 for latest
 * @param {string} newTreeId - Destination folder tree ID
 * @param {number} treeVersion - Destination tree version; pass -1 to skip check
 * @param {string} newFilename - Filename in the destination folder
 * @param {boolean} overwriteIfPresent - Overwrite existing file if true
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysMoveGlobalFile = (context, fileId, version, newTreeId, treeVersion,
    newFilename, overwriteIfPresent, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_MOVE_GLOBAL_FILE',
        data: {
            fileId: fileId,
            version: version,
            newTreeId: newTreeId,
            treeVersion: treeVersion,
            newFilename: newFilename,
            overwriteIfPresent: overwriteIfPresent
        }
    }, callback);
};

/**
 * Deletes a single global file. Pass version=-1 to delete without a version check.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} fileId - File to delete
 * @param {number} version - File version; pass -1 to skip check
 * @param {string} filename - Filename
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysDeleteGlobalFile = (context, fileId, version, filename, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_DELETE_GLOBAL_FILE',
        data: { fileId: fileId, version: version, filename: filename }
    }, callback);
};

/**
 * Deletes all global files in the specified folder.
 * Set recurse=true to also delete files in sub-folders.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} treeId - Folder tree ID
 * @param {string} folderPath - Folder path
 * @param {number} treeVersion - Tree version; pass -1 to skip check
 * @param {boolean} recurse - Delete files in sub-folders as well
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysDeleteGlobalFiles = (context, treeId, folderPath, treeVersion, recurse, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_DELETE_GLOBAL_FILES',
        data: { treeId: treeId, folderPath: folderPath, treeVersion: treeVersion, recurse: recurse }
    }, callback);
};

// -----------------------------------------------------------------------
// Folder Management
// -----------------------------------------------------------------------

/**
 * Creates a new folder at the given path.
 * Set createInterimDirectories=true to auto-create any missing parent folders.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} folderPath - Path for the new folder
 * @param {number} treeVersion - Tree version; pass -1 to skip check
 * @param {string} name - Folder name
 * @param {string} desc - Folder description
 * @param {boolean} createInterimDirectories - Create missing parent folders if true
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysCreateFolder = (context, folderPath, treeVersion, name, desc,
    createInterimDirectories, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_CREATE_FOLDER',
        data: {
            folderPath: folderPath,
            treeVersion: treeVersion,
            name: name,
            desc: desc,
            createInterimDirectories: createInterimDirectories
        }
    }, callback);
};

/**
 * Moves a folder to a new path, optionally renaming it.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} treeId - Folder tree ID
 * @param {number} treeVersion - Tree version; pass -1 to skip check
 * @param {string} newFolderPath - Destination path
 * @param {string} updatedName - New folder name
 * @param {boolean} createInterimDirectories - Create missing parent folders if true
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysMoveFolder = (context, treeId, treeVersion, newFolderPath, updatedName,
    createInterimDirectories, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_MOVE_FOLDER',
        data: {
            treeId: treeId,
            treeVersion: treeVersion,
            newFolderPath: newFolderPath,
            updatedName: updatedName,
            createInterimDirectories: createInterimDirectories
        }
    }, callback);
};

/**
 * Renames a folder in place.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} treeId - Folder tree ID
 * @param {number} treeVersion - Tree version; pass -1 to skip check
 * @param {string} updatedName - New folder name
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysRenameFolder = (context, treeId, treeVersion, updatedName, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_RENAME_FOLDER',
        data: { treeId: treeId, treeVersion: treeVersion, updatedName: updatedName }
    }, callback);
};

/**
 * Resolves the treeId for a folder given its full path (e.g. "/folder/sub/").
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} fullFolderPath - Full folder path
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysLookupFolder = (context, fullFolderPath, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_LOOKUP_FOLDER',
        data: { fullFolderPath: fullFolderPath }
    }, callback);
};

/**
 * Deletes a folder. Set force=true to also delete any files and sub-folders inside it.
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} treeId - Folder tree ID
 * @param {string} folderPath - Folder path
 * @param {number} treeVersion - Tree version; pass -1 to skip check
 * @param {boolean} force - Delete files and sub-folders inside the folder if true
 * @param {function} callback - (context, result) where result is the parsed response
 */
exports.sysDeleteFolder = (context, treeId, folderPath, treeVersion, force, callback) => {
    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_DELETE_FOLDER',
        data: { treeId: treeId, folderPath: folderPath, treeVersion: treeVersion, force: force }
    }, callback);
};

// -----------------------------------------------------------------------
// Upload
// -----------------------------------------------------------------------

/**
 * Uploads a file to the brainCloud Global File V3 system via S2S.
 *
 * Internally performs SYS_PREPARE_UPLOAD to obtain an uploadId, then POSTs the
 * file bytes to the upload endpoint as multipart/form-data. Metadata (gameId,
 * uploadId) travels as URL query parameters; only the file bytes are in the body.
 *
 * @param {object} context - S2S context returned by brainclouds2s.init()
 * @param {string} treeId - Folder tree ID (use "_root_" for root; call sysLookupFolder for sub-folders)
 * @param {string} filename - Name of the file as it will appear in brainCloud
 * @param {boolean} overwriteIfPresent - Replace any existing file with the same name
 * @param {Buffer} fileData - File content as a Node.js Buffer (or any Uint8Array)
 * @param {function} callback - (context, result) where result is the parsed upload response
 */
exports.uploadGlobalFile = (context, treeId, filename, overwriteIfPresent, fileData, callback) => {
    if (context.logEnabled) {
        console.log('[GlobalFileV3] Preparing upload: ' + filename +
            ' (' + fileData.length + ' bytes) treeId=' + treeId);
    }

    brainclouds2s.request(context, {
        service: 'globalFileV3',
        operation: 'SYS_PREPARE_UPLOAD',
        data: {
            treeId: treeId,
            filename: filename,
            overwriteIfPresent: overwriteIfPresent,
            fileSize: fileData.length
        }
    }, (ctx, result) => {
        if (!result || result.status !== 200) {
            if (context.logEnabled) {
                console.log('[GlobalFileV3] SYS_PREPARE_UPLOAD failed: ' + JSON.stringify(result));
            }
            if (callback) callback(ctx, result);
            return;
        }

        var fileDetails = result.data && result.data.fileDetails;
        if (!fileDetails || !fileDetails.uploadId) {
            if (context.logEnabled) {
                console.log('[GlobalFileV3] SYS_PREPARE_UPLOAD missing fileDetails/uploadId: ' +
                    JSON.stringify(result));
            }
            if (callback) callback(ctx, result);
            return;
        }

        var uploadId = fileDetails.uploadId;
        var uploadUrl = buildUploadUrl(context, fileDetails, uploadId);

        if (context.logEnabled) {
            console.log('[GlobalFileV3] Uploading to: ' + uploadUrl);
        }

        sendFileUpload(context, uploadUrl, filename, fileData, callback);
    });
};

// -----------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------

/**
 * Constructs an absolute upload URL from the prepare response.
 * If the server returned a relative uploadUrl we prefix it with the scheme and host.
 * Falls back to deriving the URL from context.url.
 */
function buildUploadUrl(context, fileDetails, uploadId) {
    if (fileDetails.uploadUrl) {
        var relativeUrl = fileDetails.uploadUrl;
        if (relativeUrl.startsWith('http')) {
            return relativeUrl;
        }
        // Relative path returned by server — prefix with scheme + host
        return 'https://' + context.url + relativeUrl;
    }
    // Fallback: construct from context.url (hostname only)
    return 'https://' + context.url + DEFAULT_UPLOAD_PATH +
        '?gameId=' + encodeURIComponent(context.appId) +
        '&uploadId=' + encodeURIComponent(uploadId);
}

/**
 * POSTs file bytes to uploadUrl as multipart/form-data using the Node.js https module.
 * All metadata is carried as URL query parameters; only the file bytes travel in the body.
 */
function sendFileUpload(context, uploadUrl, filename, fileData, callback) {
    var boundary = '----BrainCloudS2SBoundary' + Date.now();
    var fileBuffer = Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData);

    var headerPart = Buffer.from(
        '--' + boundary + '\r\n' +
        'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n' +
        'Content-Type: application/octet-stream\r\n\r\n'
    );
    var footerPart = Buffer.from('\r\n--' + boundary + '--\r\n');
    var body = Buffer.concat([headerPart, fileBuffer, footerPart]);

    var parsedUrl = new URL(uploadUrl);
    var options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
            'Content-Type': 'multipart/form-data; boundary=' + boundary,
            'Content-Length': body.length
        }
    };

    if (context.logEnabled) {
        console.log('[GlobalFileV3] POST ' + options.hostname + options.path +
            ' (' + body.length + ' bytes)');
    }

    var req = https.request(options, (res) => {
        var data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            if (context.logEnabled) {
                console.log('[GlobalFileV3] Upload response: ' + data);
            }
            var responseData = null;
            try { responseData = JSON.parse(data); } catch (e) {}
            if (callback) callback(context, responseData);
        });
    });

    req.on('error', (err) => {
        if (context.logEnabled) {
            console.log('[GlobalFileV3] Upload error: ' + err.message);
        }
        if (callback) callback(context, { status: 900, status_message: 'File upload failed: ' + err.message });
    });

    req.write(body);
    req.end();
}
