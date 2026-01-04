module.exports = {
  apps: [{
    name: 'md-to-img',
    script: 'node_modules/.bin/electron',
    args: '.',
    cwd: '/Users/linggarry/Workspace/md_to_img',
    watch: false,
    autorestart: true,
    max_restarts: 3,
    env: {
      NODE_ENV: 'production',
      ELECTRON_ENABLE_LOGGING: 1
    }
  }]
};

