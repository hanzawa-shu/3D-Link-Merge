import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class SceneManager {
  constructor(canvas, config) {
    this.config = config;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141428);
    this.scene.fog = new THREE.Fog(0x141428, 18, 40);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);

    const boardCenter = ((config.boardSize - 1) / 2) * config.cellSize;
    this.boardCenter = boardCenter;

    this.camera.position.set(boardCenter - 7, 9, boardCenter + 8);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(boardCenter, config.maxHeight * 0.3, boardCenter);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // 盤面中心を注視点として固定するため、位置移動（パン）は無効化する。
    // これによりPCの右ドラッグは無効、スマホの2本指操作はズームのみになり、
    // 盤面を画面外へ見失う事故を防ぐ。
    this.controls.enablePan = false;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 28;
    this.controls.maxPolarAngle = Math.PI * 0.49;

    this._setupLights();
    this._setupFloor();

    this.objectGroup = new THREE.Group();
    this.scene.add(this.objectGroup);

    this._resizeHandler = () => this.onResize();
    window.addEventListener("resize", this._resizeHandler);
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(12, 22, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(dirLight);
  }

  _setupFloor() {
    const size = this.config.boardSize * this.config.cellSize;
    const floorGeo = new THREE.PlaneGeometry(size, size);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x23233f, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.boardCenter, 0, this.boardCenter);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(size, this.config.boardSize, 0x5a5a8a, 0x3a3a5a);
    grid.position.set(this.boardCenter, 0.01, this.boardCenter);
    this.scene.add(grid);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** 盤面サイズ変更後に作り直す際、古いリスナー・WebGLコンテキストを解放する。 */
  dispose() {
    window.removeEventListener("resize", this._resizeHandler);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
