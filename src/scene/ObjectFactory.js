import * as THREE from "three";

const GEOMETRY_BUILDERS = {
  white: () => new THREE.SphereGeometry(0.4, 24, 16),
  yellow: () => new THREE.BoxGeometry(0.68, 0.68, 0.68),
  red: () => new THREE.OctahedronGeometry(0.5, 0),
  blue: () => new THREE.ConeGeometry(0.45, 0.85, 20),
  green: () => new THREE.TorusGeometry(0.32, 0.17, 16, 32),
  purple: () => new THREE.DodecahedronGeometry(0.45, 0),
  orange: () => new THREE.IcosahedronGeometry(0.45, 0),
  black: () => new THREE.TorusKnotGeometry(0.28, 0.11, 64, 8),
};

const COLOR_HEX = {
  white: 0xf5f5f5,
  yellow: 0xffd93d,
  red: 0xff5757,
  blue: 0x4da6ff,
  green: 0x4dff9a,
  purple: 0xb768ff,
  orange: 0xff9a3d,
  black: 0x1a1a2e,
};

const EMISSIVE_HEX = {
  white: 0x222222,
  yellow: 0x554400,
  red: 0x550000,
  blue: 0x002a55,
  green: 0x005530,
  purple: 0x3d1a55,
  orange: 0x552a00,
  black: 0x6622aa,
};

export function createObjectMesh(color) {
  const geometry = GEOMETRY_BUILDERS[color]();
  const material = new THREE.MeshStandardMaterial({
    color: COLOR_HEX[color],
    emissive: EMISSIVE_HEX[color],
    transparent: true,
    opacity: 1,
    metalness: 0.25,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.color = color;
  return mesh;
}

export function colorHex(color) {
  return COLOR_HEX[color];
}

/**
 * 同一エンティティ内で高さが分かれるセル同士を繋ぐ「紐（ボンド）」メッシュ。
 * デフォルメされた幻想の分子結合というテイストで、リアルな分子モデルは目指さない。
 */
export function createBondMesh(color) {
  const geometry = new THREE.CylinderGeometry(0.09, 0.09, 1, 10);
  const material = new THREE.MeshStandardMaterial({
    color: COLOR_HEX[color],
    emissive: EMISSIVE_HEX[color],
    transparent: true,
    opacity: 0.85,
    metalness: 0.1,
    roughness: 0.5,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

/** ボンドメッシュ(円柱、初期は長さ1・Y軸方向)を、ローカル座標fromとtoの間を結ぶように配置・変形する。 */
export function positionBondBetween(mesh, from, to) {
  const fromV = new THREE.Vector3(from.x, from.y, from.z);
  const toV = new THREE.Vector3(to.x, to.y, to.z);
  const direction = toV.clone().sub(fromV);
  const length = direction.length();
  mesh.position.copy(fromV.clone().add(toV).multiplyScalar(0.5));
  mesh.scale.set(1, Math.max(length, 1e-4), 1);
  if (length > 1e-6) {
    const up = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(up, direction.normalize());
  }
}
