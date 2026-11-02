const { saveCompressedImage } = require('../utils/compressImage');

async function compressEmployeePhotos(req, _res, next) {
  try {
    if (req.body && req.body.profilePhoto) {
      req.body.profilePhoto = await saveCompressedImage(req.body.profilePhoto, {
        folder: 'employees',
        preset: 'profile',
      });
    }
    if (req.body && Array.isArray(req.body.idPhotos)) {
      req.body.idPhotos = await Promise.all(
        req.body.idPhotos.map((photo) => saveCompressedImage(photo, {
          folder: 'employees',
          preset: 'id',
        }))
      );
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = compressEmployeePhotos;
