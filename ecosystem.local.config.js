module.exports = {
  apps: [{
    name: 'local-file-monitor',
    script: './local-server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    env_file: './.env.local',
    error_file: './logs/pm2-local-error.log',
    out_file: './logs/pm2-local-out.log',
    log_file: './logs/pm2-local-combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};