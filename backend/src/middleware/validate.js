/**
 * Zod validation middleware.
 * validate(schema) parses req.body; on success req.body is replaced with the cleaned data,
 * on failure responds 400 with a readable list of problems.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: result.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = validate;
