/**
 * QR Code Mock Generator (SVG-based, deterministic)
 * Menghasilkan representasi visual QR Code yang tampak asli secara offline.
 * Berdasarkan input teks, kode ini menghasilkan pola biner yang konsisten.
 */
class QRHelper {
    /**
     * Sederhana hash fungsi untuk menghasilkan deretan bit berdasarkan string input.
     * @param {string} str 
     * @returns {number}
     */
    static djb2Hash(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        return hash;
    }

    /**
     * Menghasilkan SVG QR Code.
     * @param {string} text Konten yang di-encode
     * @param {number} size Ukuran grid (default 25 untuk QR Version 2)
     * @returns {string} SVG String
     */
    static generateSVG(text, size = 25) {
        const hash = this.djb2Hash(text);
        const matrix = [];
        
        // Inisialisasi matriks dengan 0
        for (let r = 0; r < size; r++) {
            matrix.push(new Array(size).fill(0));
        }

        // Fungsi pembantu untuk menggambar Finder Pattern (kotak besar di sudut)
        const drawFinder = (row, col) => {
            for (let r = 0; r < 7; r++) {
                for (let c = 0; c < 7; c++) {
                    // Kotak luar (7x7) dan kotak dalam (3x3), dipisahkan oleh spasi putih
                    if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                        if (row + r < size && col + c < size) {
                            matrix[row + r][col + c] = 1;
                        }
                    }
                }
            }
        };

        // Gambar Finder Pattern di 3 sudut
        drawFinder(0, 0); // Top-Left
        drawFinder(0, size - 7); // Top-Right
        drawFinder(size - 7, 0); // Bottom-Left

        // Gambar Alignment Pattern (kotak kecil di kanan bawah)
        const alignSize = 5;
        const alignRow = size - 9;
        const alignCol = size - 9;
        for (let r = 0; r < alignSize; r++) {
            for (let c = 0; c < alignSize; c++) {
                if (r === 0 || r === 4 || c === 0 || c === 4 || (r === 2 && c === 2)) {
                    matrix[alignRow + r][alignCol + c] = 1;
                }
            }
        }

        // Gambar Timing Patterns (garis putus-putus penghubung Finder)
        for (let i = 8; i < size - 8; i++) {
            matrix[6][i] = i % 2 === 0 ? 1 : 0;
            matrix[i][6] = i % 2 === 0 ? 1 : 0;
        }

        // Isi sisa sel secara pseudo-random menggunakan LCG berbasis hash teks
        let seed = Math.abs(hash);
        const lcg = () => {
            seed = (1103515245 * seed + 12345) % 2147483648;
            return seed / 2147483648;
        };

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                // Jangan timpa Finder Patterns
                const isTopLeftFinder = r < 8 && c < 8;
                const isTopRightFinder = r < 8 && c >= size - 8;
                const isBottomLeftFinder = r >= size - 8 && c < 8;
                // Jangan timpa Alignment Pattern
                const isAlignment = r >= alignRow - 1 && r < alignRow + alignSize + 1 && c >= alignCol - 1 && c < alignCol + alignSize + 1;
                // Jangan timpa Timing Pattern
                const isTiming = r === 6 || c === 6;

                if (!isTopLeftFinder && !isTopRightFinder && !isBottomLeftFinder && !isAlignment && !isTiming) {
                    // 50% kemungkinan hitam berdasarkan generator pseudo-random
                    matrix[r][c] = lcg() > 0.5 ? 1 : 0;
                }
            }
        }

        // Buat string SVG
        const cellSize = 10;
        const width = size * cellSize;
        const height = size * cellSize;
        let paths = "";

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (matrix[r][c] === 1) {
                    paths += `M${c * cellSize},${r * cellSize}h${cellSize}v${cellSize}h-${cellSize}z `;
                }
            }
        }

        return `<svg viewBox="0 0 ${width} ${height}" class="qr-svg" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="none"/>
            <path d="${paths}" fill="var(--qr-color, #00f2fe)"/>
        </svg>`;
    }
}

window.QRHelper = QRHelper;
