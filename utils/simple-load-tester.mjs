import { request } from "undici"

run().catch((err) => console.error(err.message, err.stack))

async function run() {
    let requests = 0
    let errors = 0

    const start = Date.now()

    let results = []

    for (let i = 0; i < 100; i++) {
        results.push(testIteration())
    }

    results = await Promise.all(results)

    const time = Date.now() - start

    for (const result of results) {
        requests += result.requests
        errors += result.errors
    }

    const seconds = time / 1000
    const requestsPerSecond = requests / seconds

    console.log(`${requests} requests in ${seconds} seconds`)
    console.log(`${requestsPerSecond} requests per second`)
    console.log(`${errors} errors`)
}

async function testIteration() {
    const stats = {
        requests: 0,
        errors: 0,
    }
    stats.requests++
    const { statusCode, body } = await request("http://127.0.0.1:7000/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"type":"json"}',
    })

    if (statusCode !== 200) {
        stats.errors++
        console.error(await body.text())
        return stats
    }

    const config = await body.json()

    for (let i = 0; i < 5000; i++) {
        const { statusCode, body } = await request(`http://127.0.0.1:7000/log/${config.logId}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"hello":"world"}',
        })
        stats.requests++

        if (statusCode !== 200) {
            stats.errors++
            console.error(await body.text())
        }
    }

    return stats
}
