const array = []

for (let i=0; i< 100_000_000_000; i++) {
    if (i % 1_000_000_000 === 0) {
        console.log(i)
    }
}

setTimeout(() => {
    console.log('done')
}, 10000)
