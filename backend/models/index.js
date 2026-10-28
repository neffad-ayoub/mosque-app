/**
 * تسجيل كل النماذج في Mongoose.
 * ضروري لأن populate() يبحث عن النموذج بالاسم (مثل 'Committee')
 * ويفشل إذا لم يكن أي ملف قد استورده.
 */
module.exports = {
  User: require('./User'),
  Mosque: require('./Mosque'),
  Committee: require('./Committee'),
  AccessCode: require('./AccessCode')
};
