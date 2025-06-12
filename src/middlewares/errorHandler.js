const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Log file access attempts
  if (req.url.startsWith('/uploads')) {
    console.log('File access attempt:', req.url);
  }

  if (err.code === 'ENOENT') {
    return res.status(404).json({
      success: false,
      message: 'File not found',
      path: req.url
    });
  }

  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
};

module.exports = errorHandler; 