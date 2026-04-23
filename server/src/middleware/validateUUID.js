/**
 * Middleware to validate UUID format for specific request parameters.
 * Prevents DB driver from crashing on malformed strings.
 */
const validateUUID = (paramNames) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return (req, res, next) => {
    const names = Array.isArray(paramNames) ? paramNames : [paramNames];

    for (const name of names) {
      const value = req.params[name];
      if (value && !uuidRegex.test(value)) {
        return res.status(400).json({
          error: { message: `Malformed ID: '${value}' is not a valid UUID.` }
        });
      }
    }

    next();
  };
};

module.exports = validateUUID;
