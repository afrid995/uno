#!/bin/sh
mkdir -p /run/postgresql
chown -R postgres:postgres /run/postgresql

sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /mnt/host/d/uno/database/pgdata/postgresql.conf
grep -q "0.0.0.0/0 trust" /mnt/host/d/uno/database/pgdata/pg_hba.conf || echo "host all all 0.0.0.0/0 trust" >> /mnt/host/d/uno/database/pgdata/pg_hba.conf
grep -q "::0/0 trust" /mnt/host/d/uno/database/pgdata/pg_hba.conf || echo "host all all ::0/0 trust" >> /mnt/host/d/uno/database/pgdata/pg_hba.conf

su - postgres -c "pg_ctl -D /mnt/host/d/uno/database/pgdata -l /mnt/host/d/uno/database/pgdata/logfile start"
sleep 2

su - postgres -c "psql -c 'CREATE DATABASE uno_ultimate;'" 2>/dev/null || true
su - postgres -c "psql -c 'ALTER USER postgres WITH PASSWORD '\''postgres'\'';'" 2>/dev/null || true
su - postgres -c "psql -c 'GRANT ALL PRIVILEGES ON DATABASE uno_ultimate TO postgres;'" 2>/dev/null || true

echo "PostgreSQL is running and database uno_ultimate is ready."
# Keep process alive so WSL does not shut down
tail -f /mnt/host/d/uno/database/pgdata/logfile
