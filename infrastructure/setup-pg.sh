#!/bin/sh
mkdir -p /run/postgresql
chown -R postgres:postgres /run/postgresql
su - postgres -c "pg_ctl -D /mnt/host/wsl/pgdata -l /mnt/host/wsl/pgdata/logfile start"
sleep 2
su - postgres -c "psql -c 'CREATE DATABASE uno_ultimate;'"
su - postgres -c "psql -c 'ALTER USER postgres WITH PASSWORD '\''postgres'\'';'" || true
su - postgres -c "psql -c 'GRANT ALL PRIVILEGES ON DATABASE uno_ultimate TO postgres;'"
echo "Postgres started successfully!"
