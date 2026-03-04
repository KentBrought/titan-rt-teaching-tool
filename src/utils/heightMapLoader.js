/**
 * Load the pre-generated Titan heightmap as a Three.js texture for use as a displacementMap.
 *
 * The heightmap is a 2048×1024 grayscale equirectangular PNG produced by
 * generate_heightmap.py from the ISS basemap.
 */
import * as THREE from 'three';

const HEIGHTMAP_URL = `${process.env.PUBLIC_URL}/assets/3d-assets/titan_heightmap.png`;

/**
 * Load the Titan heightmap and return a THREE.Texture.
 * @returns {Promise<THREE.Texture>}
 */
export function loadHeightMap() {
    return new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(
            HEIGHTMAP_URL,
            (texture) => {
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                resolve(texture);
            },
            undefined,
            (err) => reject(new Error(`Failed to load heightmap: ${err?.message || HEIGHTMAP_URL}`))
        );
    });
}
