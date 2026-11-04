// 3D-СБОРКА: Three.js подгружается только при появлении секции рядом с экраном.
const showcase = document.querySelector("[data-build-scene]");
const canvas = showcase?.querySelector("[data-build-canvas]");

if (showcase && canvas) {
  const stageButtons = [...showcase.querySelectorAll("[data-build-stage]")];
  const fallback = showcase.querySelector("[data-build-fallback]");
  const stageNumber = showcase.querySelector("[data-build-number]");
  const stageTitle = showcase.querySelector("[data-build-title]");
  const stageDescription = showcase.querySelector("[data-build-description]");
  const buildStatus = showcase.querySelector("[data-build-status]");
  const replayButton = showcase.querySelector("[data-build-replay]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stages = [
    { title: "Фундамент", description: "Готовим участок, размечаем план и закладываем основание." },
    { title: "Каркас", description: "Собираем несущую конструкцию и задаём форму дому." },
    { title: "Стены и окна", description: "Закрываем контур, устанавливаем окна и входную дверь." },
    { title: "Кровля", description: "Собираем крышу и защищаем дом от погоды." },
    { title: "Готовый дом", description: "Финальная проверка, благоустройство и ключи." },
  ];
  let inViewport = false;
  let loadPromise = null;
  let three = null;
  let renderer = null;
  let camera = null;
  let house = null;
  let pieces = [];
  let progress = 1;
  let animationFrame = 0;
  let animationFrom = 1;
  let animationTo = 1;
  let animationStart = 0;
  let animationDuration = 0;
  let userTouched = false;
  let autoStarted = false;
  let activeStage = 4;
  let requestedStage = 4;
  let dragging = false;
  let dragX = 0;
  let dragY = 0;
  let orbitFrame = 0;
  let pitch = -.42;
  let yaw = -.48;
  let targetPitch = pitch;
  let targetYaw = yaw;

  const ease = (value) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  const stageAt = (value) => Math.max(0, Math.min(4, Math.ceil(value * 5) - 1));
  const stageProgress = (index) => (index + 1) / 5;

  function updateStage(index) {
    activeStage = index;
    const stage = stages[index];
    if (stageNumber) stageNumber.textContent = String(index + 1).padStart(2, "0");
    if (stageTitle) stageTitle.textContent = stage.title;
    if (stageDescription) stageDescription.textContent = stage.description;
    stageButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    if (buildStatus) buildStatus.textContent = index === 4 ? "ДОМ ПОСТРОЕН · 3D-МОДЕЛЬ" : `ЭТАП ${String(index + 1).padStart(2, "0")} · ${stage.title.toLocaleUpperCase("ru-RU")}`;
  }

  function draw() {
    if (renderer && house && camera) renderer.render(house.userData.scene, camera);
  }

  function animateProgress(to, duration) {
    animationFrom = progress;
    animationTo = Math.max(0, Math.min(1, to));
    animationStart = performance.now();
    animationDuration = reducedMotion.matches ? 0 : duration;
    if (animationDuration === 0) {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      progress = animationTo;
      applyProgress(progress);
      draw();
      animationFrame = 0;
      return;
    }
    if (!animationFrame) animationFrame = requestAnimationFrame(tickProgress);
  }

  function applyProgress(value) {
    progress = value;
    pieces.forEach((piece) => {
      const local = ease((value - piece.start) / (piece.end - piece.start));
      piece.mesh.visible = local > .001;
      if (!piece.mesh.visible) return;
      if (piece.mode === "rise") {
        piece.mesh.scale.set(1, Math.max(.001, local), 1);
        piece.mesh.position.y = piece.y - piece.height * (1 - local) / 2;
      } else {
        piece.mesh.scale.setScalar(Math.max(.001, local));
        piece.mesh.position.y = piece.y + (piece.offsetY || 1.35) * (1 - local);
        piece.mesh.position.x = piece.x + (piece.offsetX || 0) * (1 - local);
        piece.mesh.position.z = piece.z + (piece.offsetZ || 0) * (1 - local);
      }
    });
    const stage = stageAt(value);
    if (stage !== activeStage) updateStage(stage);
  }

  function tickProgress(now) {
    const amount = animationDuration ? Math.min(1, (now - animationStart) / animationDuration) : 1;
    applyProgress(animationFrom + (animationTo - animationFrom) * ease(amount));
    draw();
    if (amount >= 1) {
      progress = animationTo;
      applyProgress(progress);
      draw();
      animationFrame = 0;
      return;
    }
    animationFrame = requestAnimationFrame(tickProgress);
  }

  function animateOrbit() {
    if (orbitFrame || !house) return;
    const settle = () => {
      yaw += (targetYaw - yaw) * .17;
      pitch += (targetPitch - pitch) * .17;
      house.rotation.set(pitch, yaw, 0);
      draw();
      if (Math.abs(targetYaw - yaw) < .001 && Math.abs(targetPitch - pitch) < .001) {
        yaw = targetYaw;
        pitch = targetPitch;
        house.rotation.set(pitch, yaw, 0);
        draw();
        orbitFrame = 0;
        return;
      }
      orbitFrame = requestAnimationFrame(settle);
    };
    orbitFrame = requestAnimationFrame(settle);
  }

  function addPiece(scene, geometry, material, position, start, end, mode = "drop", offset = {}) {
    const mesh = new three.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    if (offset.rotation) mesh.rotation.set(...offset.rotation);
    scene.add(mesh);
    pieces.push({ mesh, x: position[0], y: position[1], z: position[2], height: geometry.parameters?.height || 1, start, end, mode, offsetX: offset.x || 0, offsetY: offset.y, offsetZ: offset.z || 0 });
    return mesh;
  }

  function makeScene(THREE) {
    three = THREE;
    const scene = new THREE.Scene();
    scene.background = null;
    const aspect = Math.max(.65, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    const viewHeight = 3.7;
    camera = new THREE.OrthographicCamera(-viewHeight * aspect, viewHeight * aspect, viewHeight, -viewHeight, .1, 100);
    camera.position.set(8, 6.7, 9);
    camera.lookAt(0, 1.05, 0);

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    scene.add(new THREE.HemisphereLight(0xe4efd8, 0x405143, 2.15));
    const key = new THREE.DirectionalLight(0xffe6c9, 3.1);
    key.position.set(-5, 9, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc8e6bb, 1.7);
    rim.position.set(5, 5, -6);
    scene.add(rim);

    house = new THREE.Group();
    house.userData.scene = scene;
    house.rotation.set(pitch, yaw, 0);
    scene.add(house);
    pieces = [];

    const material = (color, roughness = .76, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    const terrain = material(0x74866b);
    const concrete = material(0xbcbcaf);
    const concreteSide = material(0x818b7b);
    const timber = material(0x89664c);
    const wallFront = material(0xe3e2d3);
    const wallSide = material(0xaab6a2);
    const roofMaterial = material(0x986b53);
    const trim = material(0xf0eedf, .38);
    const glass = material(0x5c8280, .24, { metalness: .12, emissive: 0x203c39, emissiveIntensity: .15 });
    const doorMaterial = material(0x745842);
    const pathMaterial = material(0xc3b99d);
    const leaf = material(0x778d69);
    const darkLeaf = material(0x506c54);

    const box = (size, mat, position, start, end, mode = "drop", offset = {}) => addPiece(house, new THREE.BoxGeometry(...size), mat, position, start, end, mode, offset);
    const ground = box([7.4, .12, 8.8], terrain, [0, -.03, 0], 0, .045, "rise");
    ground.userData.kind = "lot";
    box([5.15, .28, 4.15], concrete, [0, .15, 0], .025, .18, "rise");
    box([4.75, .1, 3.8], concreteSide, [0, .32, 0], .09, .195, "rise");

    const width = 4.35, depth = 3.25, wallHeight = 2.28, base = .38, top = base + wallHeight;
    const frontZ = depth / 2;
    const postSize = .13;
    // Несущий каркас появляется до внешней отделки.
    [[-width/2, -depth/2], [width/2, -depth/2], [-width/2, depth/2], [width/2, depth/2]].forEach(([x, z]) => {
      box([postSize, wallHeight, postSize], timber, [x, base + wallHeight / 2, z], .205, .345, "rise");
    });
    box([width + .12, .14, .14], timber, [0, top - .02, frontZ], .275, .39, "rise");
    box([width + .12, .14, .14], timber, [0, top - .02, -frontZ], .275, .39, "rise");
    box([.14, .14, depth + .12], timber, [-width/2, top - .02, 0], .3, .41, "rise");
    box([.14, .14, depth + .12], timber, [width/2, top - .02, 0], .3, .41, "rise");

    // Светлый фасад, боковые стены и торцы.
    box([width, wallHeight, .14], wallFront, [0, base + wallHeight/2, frontZ - .04], .405, .565, "rise");
    box([width, wallHeight, .14], wallSide, [0, base + wallHeight/2, -frontZ + .04], .41, .565, "rise");
    box([.14, wallHeight, depth], wallSide, [-width/2 + .04, base + wallHeight/2, 0], .42, .57, "rise");
    box([.14, wallHeight, depth], wallSide, [width/2 - .04, base + wallHeight/2, 0], .42, .57, "rise");

    // Треугольные фронтоны — геометрия задаётся в плоскости фасада.
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-width/2, 0); gableShape.lineTo(width/2, 0); gableShape.lineTo(0, 1.08); gableShape.closePath();
    const gableGeometry = new THREE.ShapeGeometry(gableShape);
    const gableFront = addPiece(house, gableGeometry, wallFront, [0, top, frontZ - .105], .52, .625, "rise");
    gableFront.geometry.computeVertexNormals();
    const gableBack = addPiece(house, gableGeometry, wallSide, [0, top, -frontZ + .105], .52, .625, "rise");
    gableBack.rotation.y = Math.PI;
    gableBack.geometry.computeVertexNormals();

    // Оконные рамы, стекло и дверь встают на фасад после стен.
    const addWindow = (x, y, w, h) => {
      box([w + .12, h + .12, .06], trim, [x, y, frontZ + .055], .53, .62, "drop", { z: .3 });
      box([w, h, .045], glass, [x, y, frontZ + .09], .55, .63, "drop", { z: .3 });
      box([.045, h, .035], trim, [x, y, frontZ + .116], .565, .64, "drop", { z: .3 });
      box([w, .04, .035], trim, [x, y, frontZ + .116], .565, .64, "drop", { z: .3 });
    };
    addWindow(-.55, base + 1.32, .84, .92);
    addWindow(1.12, base + 1.32, .84, .92);
    box([.88, 1.96, .075], trim, [-1.62, base + .98, frontZ + .08], .53, .64, "drop", { z: .34 });
    box([.72, 1.83, .05], doorMaterial, [-1.62, base + .92, frontZ + .125], .56, .65, "drop", { z: .34 });
    const handleGeometry = new THREE.SphereGeometry(.045, 10, 8);
    addPiece(house, handleGeometry, material(0xc3a56e, .34, { metalness: .35 }), [-1.35, base + .94, frontZ + .165], .62, .68, "drop", { z: .32 });

    // Два ската крыши собираются по очереди.
    const rise = 1.08;
    const roofAngle = Math.atan2(rise, width / 2);
    const roofLength = Math.hypot(width / 2 + .28, rise);
    const leftRoof = box([roofLength, .16, depth + .5], roofMaterial, [-width/4 - .12, top + rise/2, 0], .615, .79, "drop", { y: 2.1 });
    leftRoof.rotation.z = roofAngle;
    const rightRoof = box([roofLength, .16, depth + .5], roofMaterial, [width/4 + .12, top + rise/2, 0], .65, .805, "drop", { y: 2.1 });
    rightRoof.rotation.z = -roofAngle;
    box([.12, .1, depth + .5], trim, [0, top + rise + .015, 0], .7, .82, "drop", { y: 1.65 });

    // Терраса, дорожка и зелень завершают участок.
    box([1.7, .14, .78], concrete, [-1.6, .49, frontZ + .46], .79, .88, "drop", { z: .8 });
    box([1.05, .24, .42], concreteSide, [-1.6, .15, frontZ + .91], .8, .9, "rise");
    for (let i = 0; i < 4; i++) box([.58, .08, .34], pathMaterial, [-1.6, .075, frontZ + 1.48 + i * .36], .83 + i * .018, .95 + i * .012, "rise");
    const bushGeometry = new THREE.IcosahedronGeometry(.34, 1);
    [[-2.55, .34, 1.18], [-2.85, .28, .45], [2.45, .34, -1.15], [2.78, .27, -.48], [1.8, .31, 2.18]].forEach(([x, y, z], i) => {
      const shrub = addPiece(house, bushGeometry, i % 2 ? darkLeaf : leaf, [x, y, z], .83 + i * .012, .96, "drop", { y: .65 });
      shrub.scale.setScalar(.001);
    });
    const bollard = material(0xd7d2b8, .45, { emissive: 0xb8ce84, emissiveIntensity: .23 });
    [[-2.15, .27, 1.85], [-1.08, .27, 2.3], [-2.24, .27, -1.9]].forEach(([x, y, z]) => {
      box([.09, .48, .09], timber, [x, y, z], .88, .98, "rise");
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), bollard);
      lamp.position.set(x, y + .27, z); lamp.visible = false; house.add(lamp);
      pieces.push({ mesh: lamp, x, y: y + .27, z, height: .18, start: .9, end: 1, mode: "drop", offsetY: .4 });
    });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(3.55, 48), new THREE.MeshBasicMaterial({ color: 0x07130d, transparent: true, opacity: .3, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.095; shadow.scale.set(1.1, .78, 1); house.add(shadow);

    // Низкополигональные кусты и опоры не нуждаются в тяжёлых текстурах.
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    progress = 0;
    applyProgress(0);
    draw();
  }

  function resizeScene() {
    if (!renderer || !camera) return;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const aspect = width / height;
    const viewHeight = height < 400 ? 3.65 : 3.55;
    camera.left = -viewHeight * aspect;
    camera.right = viewHeight * aspect;
    camera.top = viewHeight;
    camera.bottom = -viewHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    draw();
  }

  function startBuild() {
    if (!renderer || autoStarted || userTouched || !inViewport) return;
    autoStarted = true;
    if (reducedMotion.matches) {
      updateStage(4);
      animateProgress(1, 0);
      return;
    }
    updateStage(0);
    animateProgress(1, 9200);
  }

  function failToFallback() {
    showcase.dataset.buildFallbackOnly = "true";
    canvas.setAttribute("aria-hidden", "true");
    canvas.tabIndex = -1;
    fallback?.removeAttribute("aria-hidden");
    if (buildStatus) buildStatus.textContent = "СХЕМА ДОМА · 3D-ПРЕДПРОСМОТР";
    stageButtons.forEach((button) => { button.disabled = true; button.setAttribute("aria-label", `${button.getAttribute("aria-label")} (недоступно)`); });
    if (replayButton) { replayButton.disabled = true; replayButton.textContent = "3D-сцена недоступна"; }
  }

  function loadScene() {
    if (loadPromise) return loadPromise;
    loadPromise = import("https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js")
      .then((THREE) => {
        makeScene(THREE);
        showcase.dataset.buildReady = "true";
        canvas.removeAttribute("aria-hidden");
        canvas.tabIndex = 0;
        fallback?.setAttribute("aria-hidden", "true");
        if ("ResizeObserver" in window) {
          const observer = new ResizeObserver(resizeScene);
          observer.observe(canvas);
        } else window.addEventListener("resize", resizeScene, { passive: true });
        resizeScene();
        if (userTouched) {
          updateStage(requestedStage);
          animateProgress(stageProgress(requestedStage), 0);
        } else startBuild();
      })
      .catch(() => failToFallback());
    return loadPromise;
  }

  if ("IntersectionObserver" in window) {
    const sceneObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        inViewport = entry.isIntersecting;
        if (inViewport) {
          loadScene();
          startBuild();
        }
      });
    }, { rootMargin: "120px 0px" });
    sceneObserver.observe(showcase);
  } else {
    inViewport = true;
    loadScene();
  }

  stageButtons.forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.buildStage);
    if (!Number.isInteger(index) || index < 0 || index > 4) return;
    userTouched = true;
    autoStarted = true;
    requestedStage = index;
    updateStage(index);
    if (renderer) animateProgress(stageProgress(index), 950);
  }));

  replayButton?.addEventListener("click", () => {
    userTouched = true;
    autoStarted = true;
    if (!renderer) return;
    updateStage(0);
    animateProgress(0, 0);
    if (reducedMotion.matches) { updateStage(4); animateProgress(1, 0); }
    else animateProgress(1, 9200);
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!house) return;
    dragging = true;
    dragX = event.clientX;
    dragY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    targetYaw += (event.clientX - dragX) * .008;
    targetPitch = Math.max(-.9, Math.min(.05, targetPitch + (event.clientY - dragY) * .006));
    dragX = event.clientX;
    dragY = event.clientY;
    animateOrbit();
  });
  const endDrag = () => { dragging = false; canvas.classList.remove("is-dragging"); };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") targetYaw -= .12;
    else if (event.key === "ArrowRight") targetYaw += .12;
    else if (event.key === "ArrowUp") targetPitch = Math.max(-.9, targetPitch - .08);
    else if (event.key === "ArrowDown") targetPitch = Math.min(.05, targetPitch + .08);
    else return;
    event.preventDefault();
    animateOrbit();
  });
}
