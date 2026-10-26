function applyJson(schema) {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret) {
      if (ret._id) ret.id = ret._id.toString();
      delete ret._id;
      delete ret.passwordHash;
      delete ret.tokenVersion;
      return ret;
    },
  });

  schema.set('toObject', {
    virtuals: true,
    versionKey: false,
  });
}

module.exports = applyJson;
