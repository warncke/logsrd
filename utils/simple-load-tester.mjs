import { Pool, request } from "undici"

run().catch((err) => console.error(err.message, err.stack))

async function run() {
    let createLogRequests = 0
    let createLogErrors = 0
    let appendRequests = 0
    let appendErrors = 0
    let headRequests = 0
    let headErrors = 0

    const start = Date.now()

    let results = []

    for (let i = 0; i < 100; i++) {
        results.push(testIteration())
    }

    results = await Promise.all(results)

    const time = Date.now() - start

    for (const result of results) {
        createLogRequests += result.createLogRequests
        createLogErrors += result.createLogErrors
        appendRequests += result.appendRequests
        appendErrors += result.appendErrors
        headRequests += result.headRequests
        headErrors += result.headErrors
    }

    const seconds = time / 1000
    const requestsPerSecond = (createLogRequests + appendRequests + headRequests) / seconds

    console.log(`${createLogRequests} create log requests in ${seconds} seconds`)
    console.log(`${createLogErrors} create log  errors`)
    console.log(`${appendRequests} append requests in ${seconds} seconds`)
    console.log(`${appendErrors} append  errors`)
    console.log(`${headRequests} head requests in ${seconds} seconds`)
    console.log(`${headErrors} head  errors`)
    console.log(`${requestsPerSecond} requests per second`)
}

async function testIteration() {
    const dispatcher = new Pool("http://127.0.0.1:7000", {
        pipelining: 10,
        connections: 10,
        connect: {
            rejectUnauthorized: false,
        },
    })
    const stats = {
        createLogRequests: 0,
        createLogErrors: 0,
        appendRequests: 0,
        appendErrors: 0,
        headRequests: 0,
        headErrors: 0,
    }
    stats.createLogRequests++
    const { statusCode, body } = await request("http://127.0.0.1:7000/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"type":"json"}',
        dispatcher,
    })

    if (statusCode !== 200) {
        stats.createLogErrors++
        console.error(await body.text())
        return stats
    }

    const config = await body.json()

    for (let entryNum = 0; entryNum < 1000; entryNum++) {
        const { statusCode, body } = await request(`http://127.0.0.1:7000/log/${config.logId}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: `{"entryNum":${entryNum}}`,
            dispatcher,
        })
        stats.appendRequests++

        if (statusCode !== 200) {
            stats.appendErrors++
            console.error(await body.text())
            return stats
        }

        const headRequests = Array(10)
            .fill(null)
            .map(() => request(`http://127.0.0.1:7000/log/${config.logId}/head`, { dispatcher }))
        const headResponses = await Promise.all(headRequests)

        for (const response of headResponses) {
            const { statusCode, body } = response
            stats.headRequests++

            if (statusCode !== 200) {
                stats.headErrors++
                console.error(await body.text())
                continue
            }

            const head = await body.json()

            if (head.entryNum !== entryNum) {
                stats.headErrors++
            }
        }
    }

    return stats
}
