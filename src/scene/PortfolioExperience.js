import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ScrollController } from "./ScrollController.js";
import { CameraRig } from "./CameraRig.js";
import { shortestAngleDelta } from "./math.js";
import {
  PortalVignette,
  WorkbenchVignette,
  GalleryVignette
} from "./vignettes/index.js";
import { HUDController } from "../ui/HUDController.js";

const VIGNETTE_META = [
  {
    id: "portal",
    title: "Arrival",
    subtitle: "The camera drops in from above and settles on the first scene.",
    orbitAngle: 0
  },
  {
    id: "workbench",
    title: "Retro Workbench",
    subtitle: "Tap the monitor or use the terminal panel to run the origin sequence.",
    orbitAngle: (Math.PI * 2) / 3
  },
  {
    id: "gallery",
    title: "Project Orbits",
    subtitle: "Each orb is a placeholder slot for a future case-study vignette.",
    orbitAngle: ((Math.PI * 2) / 3) * 2
  }
];

export class PortfolioExperience {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.hud = new HUDController();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.carousel = new THREE.Group();
    this.currentIndex = 0;
    this.carouselAngle = 0;
    this.carouselTargetAngle = 0;
    this._pointerDownHit = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07080c);
    this.scene.fog = new THREE.FogExp2(0x07080c, 0.08);

    this.camera = new THREE.PerspectiveCamera(
      38,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xfff1dd, 1.35);
    key.position.set(4, 8, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.55);
    rim.position.set(-5, 2, -4);
    this.scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(8, 64),
      new THREE.MeshStandardMaterial({ color: 0x10131b, roughness: 0.95, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.vignettes = [
      new PortalVignette(VIGNETTE_META[0]),
      new WorkbenchVignette(VIGNETTE_META[1], {
        showTerminal: (force) => this.hud.showTerminal(force),
        hideTerminal: () => this.hud.hideTerminal()
      }),
      new GalleryVignette(VIGNETTE_META[2])
    ];

    this.vignettes.forEach((vignette, index) => {
      vignette.mount(this.carousel);
      const angle = VIGNETTE_META[index].orbitAngle;
      vignette.group.position.set(Math.sin(angle) * 2.4, 0, Math.cos(angle) * 2.4);
      vignette.group.rotation.y = -angle + Math.PI;
    });
    this.scene.add(this.carousel);

    this.cameraRig = new CameraRig(this.camera);
    this.cameraRig.attach(canvas);
    this.cameraRig.startIntro();

    this.scroll = new ScrollController({
      scrollRoot: document.getElementById("scroll-root"),
      sectionCount: this.vignettes.length
    });

    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointerup", this._onPointerUp);

    window.addEventListener("resize", this._onResize);
    this._onResize();
    this._setActiveVignette(0, true);
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _onResize = () => {
    const { innerWidth: w, innerHeight: h } = window;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  _setActiveVignette(index, initial = false) {
    if (index === this.currentIndex && !initial) return;
    this.vignettes[this.currentIndex]?.setInactive();
    this.currentIndex = index;
    this.vignettes[this.currentIndex]?.setActive();
    const meta = VIGNETTE_META[this.currentIndex];
    this.hud.setVignette(meta);
    this.carouselTargetAngle = -meta.orbitAngle;
  }

  _updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _pickInteractive() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = this.vignettes[this.currentIndex]?.interactives ?? [];
    const hits = this.raycaster.intersectObjects(targets, false);
    return hits[0] ?? null;
  }

  _onPointerDown = (event) => {
    if (!this.cameraRig.introComplete) return;
    this._updatePointer(event);
    this._pointerDownHit = this._pickInteractive();
    if (this._pointerDownHit) {
      this.vignettes[this.currentIndex].handlePointerDown(this._pointerDownHit);
    }
  };

  _onPointerUp = () => {
    this._pointerDownHit = null;
  };

  _animate() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    const progress = this.scroll.update(dt);
    const index = this.scroll.getIndex();

    this.hud.setProgress(progress);
    this._setActiveVignette(index);

    const delta = shortestAngleDelta(this.carouselAngle, this.carouselTargetAngle);
    this.carouselAngle += delta * (1 - Math.exp(-7 * dt));
    this.carousel.rotation.y = this.carouselAngle;

    const active = this.vignettes[this.currentIndex];
    active.update(elapsed);

    const focus = active.getFocusPoint().clone();
    focus.applyMatrix4(this.carousel.matrixWorld);
    const basePosition = active.getCameraBasePosition().clone();
    basePosition.applyMatrix4(this.carousel.matrixWorld);

    if (!this.cameraRig.introComplete) {
      this.cameraRig.updateIntro(focus, basePosition, dt);
    } else {
      this.cameraRig.updateOrbit(focus, basePosition, dt);
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._animate);
  }
}
