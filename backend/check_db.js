const { Pool } = require('pg');

const pool = new Pool({
    user: "myuser",
    host: "localhost",
    database: "sack_count_db",
    password: "Dockervision01",
    port: 5432,
});

async function checkStatus() {
    try {
        const res = await pool.query(
            "SELECT train_id, indent_number, has_sequential_serials FROM dashboard_records WHERE train_id = '2025-26/02/001'"
        );
        console.log('Dashboard Records:');
        console.table(res.rows);

        const wagons = await pool.query(
            "SELECT id, train_id, indent_number, loaded_bag_count FROM wagon_records ORDER BY id DESC LIMIT 20"
        );
        console.log('Latest Wagons:');
        console.table(wagons.rows);

        const dashboard = await pool.query(
            "SELECT train_id, indent_number, has_sequential_serials FROM dashboard_records ORDER BY created_time DESC LIMIT 10"
        );
        console.log('Latest Dashboard Records:');
        console.table(dashboard.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkStatus();
