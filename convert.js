const fs = require('fs');
const path = require('path');

// Target clean paths
const pngPath = path.join(__dirname, 'icon.png');
const icoPath = path.join(__dirname, 'icon.ico');

async function run() {
    try {
        console.log('Reading source image: icon.png...');

        // Import the locally installed library module natively
        const pngToIco = (await import('png-to-ico')).default;

        // Generate the multi-layer Windows binary buffer array
        const buf = await pngToIco(pngPath);

        // Explicitly write raw binary bits safe from terminal encoding glitches
        fs.writeFileSync(icoPath, buf, { encoding: null });

        console.log('✅ Success! icon.ico generated perfectly with all standard Windows sizes.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error processing icon layout:', err.message);
        process.exit(1);
    }
}

run();
