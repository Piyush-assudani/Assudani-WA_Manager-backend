/**
 * Media Storage Service - Local Server Storage Mode
 * All images, videos, audio, and documents are stored directly on the local server.
 */
const { uploadFileToServer, uploadBufferToServer, deleteFileFromServer } = require("./localStorageService");

const uploadBufferToCloudinary = async (buffer, folder = "inbound", resourceType = "auto") => {
  return await uploadBufferToServer(buffer, folder, resourceType);
};

const uploadFileToCloudinary = async (filePath, folder = "library", resourceType = "auto") => {
  return await uploadFileToServer(filePath, folder, resourceType);
};

module.exports = {
  uploadBufferToCloudinary,
  uploadFileToCloudinary,
  uploadBufferToServer,
  uploadFileToServer,
  deleteFileFromServer,
};
