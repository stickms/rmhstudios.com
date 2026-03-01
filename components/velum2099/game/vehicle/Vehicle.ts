// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Vehicle Controller
   AE86 Sprinter Trueno (Panda) with
   keyboard controls & drift physics
   ═══════════════════════════════════════════ */

import * as THREE from 'three';

/* ── AE86 Panda Trueno colors ── */
const AE86_WHITE = 0xf0f0f0;   // High-vis panda white
const AE86_BLACK = 0x1a1a1a;   // Lower body / bumper black
const GLASS_TINT = 0x224466;
const NEON_UNDERGLOW = 0x00ffff;
const NEON_TRIM = 0x00ffcc;

export class Vehicle {
    constructor(scene) {
        this.scene = scene;

        // Physics state
        this.position = new THREE.Vector3(0, 0, 0);
        this.rotation = new THREE.Euler(0, 0, 0);
        this.velocity = 0;        // m/s forward
        this.lateralVelocity = 0; // m/s sideways (drift)
        this.steerAngle = 0;      // radians
        this.throttle = 0;        // 0..1
        this.brake = 0;           // 0..1
        this.handbrake = false;
        this.drifting = false;
        this._driftAngle = 0;     // visual body rotation offset during drift
        this.groundY = 0;         // current ground height (set externally)

        // Constants — tuned to feel like a light FR coupe
        this.maxSpeed = 55;       // m/s (~198 km/h)
        this.acceleration = 18;   // m/s²
        this.brakeForce = 30;     // m/s²
        this.friction = 5;        // m/s²
        this.maxSteer = 0.65;     // radians
        this.steerSpeed = 2.8;    // rad/s
        this.steerReturn = 4.5;   // rad/s return to center

        // Drift constants
        this.driftSteerMultiplier = 1.8;
        this.driftMaxSteer = 1.0;
        this.driftLateralFriction = 3.0;
        this.driftLateralKick = 0.35;
        this.driftGrip = 0.15;

        // Collision state
        this.boundingBox = new THREE.Box3();
        this._collisionCooldowns = new Map();
        this._collisionCooldownTime = 0.3;

        // Reusable vectors (avoid per-frame allocation)
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._fwd = new THREE.Vector3();

        // Input state
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            handbrake: false,
        };

        this._buildMesh();
        this._bindInput();
    }

    /* ═══════════════════════════════════════
       AE86 SPRINTER TRUENO — Low-Poly Build
       Panda (white/black) two-tone
       ═══════════════════════════════════════ */

    _buildMesh() {
        this.group = new THREE.Group();

        // ── Shared materials ──
        const whiteMat = new THREE.MeshStandardMaterial({
            color: AE86_WHITE, roughness: 0.35, metalness: 0.15,
            emissive: AE86_WHITE, emissiveIntensity: 0.12, // subtle self-glow for visibility
        });
        this._bodyMat = whiteMat;
        const blackMat = new THREE.MeshStandardMaterial({
            color: AE86_BLACK, roughness: 0.5, metalness: 0.3,
        });
        const glassMat = new THREE.MeshStandardMaterial({
            color: GLASS_TINT, roughness: 0.1, metalness: 0.4,
            transparent: true, opacity: 0.55,
        });

        // ── Lower body (black) ─ AE86 proportions (4.18m × 1.63m × 1.33m) ──
        const lowerGeo = new THREE.BoxGeometry(1.7, 0.35, 4.2);
        const lower = new THREE.Mesh(lowerGeo, blackMat);
        lower.position.y = 0.37;
        this.group.add(lower);

        // ── Upper body (white) ─ the iconic boxy shape ──
        const upperGeo = new THREE.BoxGeometry(1.65, 0.3, 4.1);
        const upper = new THREE.Mesh(upperGeo, whiteMat);
        upper.position.y = 0.7;
        this.group.add(upper);

        // ── Front bumper (black, slightly protruding) ──
        const fBumperGeo = new THREE.BoxGeometry(1.72, 0.2, 0.25);
        const fBumper = new THREE.Mesh(fBumperGeo, blackMat);
        fBumper.position.set(0, 0.3, -2.2);
        this.group.add(fBumper);

        // ── Rear bumper ──
        const rBumperGeo = new THREE.BoxGeometry(1.72, 0.2, 0.2);
        const rBumper = new THREE.Mesh(rBumperGeo, blackMat);
        rBumper.position.set(0, 0.3, 2.15);
        this.group.add(rBumper);

        // ── Cabin / greenhouse (glass) ──
        const cabinGeo = new THREE.BoxGeometry(1.45, 0.45, 1.6);
        const cabin = new THREE.Mesh(cabinGeo, glassMat);
        cabin.position.set(0, 1.08, -0.1);
        this.group.add(cabin);

        // ── Roof panel (white) ──
        const roofGeo = new THREE.BoxGeometry(1.35, 0.06, 1.5);
        const roof = new THREE.Mesh(roofGeo, whiteMat);
        roof.position.set(0, 1.33, -0.1);
        this.group.add(roof);

        // ── C-pillar / hatchback slope — distinctive AE86 rear ──
        const hatchGeo = new THREE.BoxGeometry(1.45, 0.35, 0.8);
        const hatch = new THREE.Mesh(hatchGeo, whiteMat);
        hatch.position.set(0, 1.02, 1.1);
        hatch.rotation.x = 0.25; // slight tilt for hatchback look
        this.group.add(hatch);

        // ── Pop-up headlights (retracted — small bumps with bright lens) ──
        const popupMat = new THREE.MeshStandardMaterial({
            color: 0x333333, roughness: 0.3, metalness: 0.6,
        });
        for (const side of [-0.55, 0.55]) {
            const housingGeo = new THREE.BoxGeometry(0.35, 0.18, 0.3);
            const housing = new THREE.Mesh(housingGeo, popupMat);
            housing.position.set(side, 0.95, -1.85);
            this.group.add(housing);

            // Exposed headlight lens (bright, always visible)
            const lensGeo = new THREE.BoxGeometry(0.28, 0.12, 0.05);
            const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
            const lens = new THREE.Mesh(lensGeo, lensMat);
            lens.position.set(side, 0.94, -2.01);
            this.group.add(lens);
        }

        // ── Front turn signals (amber) ──
        for (const side of [-0.72, 0.72]) {
            const sigGeo = new THREE.BoxGeometry(0.15, 0.1, 0.08);
            const sigMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
            const sig = new THREE.Mesh(sigGeo, sigMat);
            sig.position.set(side, 0.35, -2.18);
            this.group.add(sig);
        }

        // ── Tail lights (wide red band — iconic AE86 hatch) ──
        for (const side of [-0.6, 0.6]) {
            const tlGeo = new THREE.BoxGeometry(0.35, 0.12, 0.06);
            const tlMat = new THREE.MeshBasicMaterial({ color: 0xff1122 });
            const tl = new THREE.Mesh(tlGeo, tlMat);
            tl.position.set(side, 0.6, 2.13);
            this.group.add(tl);
        }
        // Center garnish between tail lights
        const garnishGeo = new THREE.BoxGeometry(0.6, 0.06, 0.06);
        const garnishMat = new THREE.MeshBasicMaterial({ color: 0xcc0000 });
        const garnish = new THREE.Mesh(garnishGeo, garnishMat);
        garnish.position.set(0, 0.6, 2.13);
        this.group.add(garnish);

        // ── Side mirrors ──
        for (const side of [-0.82, 0.82]) {
            const mirGeo = new THREE.BoxGeometry(0.12, 0.08, 0.15);
            const mir = new THREE.Mesh(mirGeo, blackMat);
            mir.position.set(side, 0.95, -0.7);
            this.group.add(mir);
        }

        // ── Fender flares ──
        const flareMat = new THREE.MeshStandardMaterial({
            color: AE86_BLACK, roughness: 0.6, metalness: 0.2,
        });
        const flarePositions = [
            { x: -0.88, z: -1.4 }, { x: 0.88, z: -1.4 },
            { x: -0.88, z: 1.4 }, { x: 0.88, z: 1.4 },
        ];
        for (const fp of flarePositions) {
            const flareGeo = new THREE.BoxGeometry(0.12, 0.22, 0.6);
            const flare = new THREE.Mesh(flareGeo, flareMat);
            flare.position.set(fp.x, 0.38, fp.z);
            this.group.add(flare);
        }

        // ── Neon trim lines (cyberpunk accent) ──
        const trimMat = new THREE.MeshBasicMaterial({ color: NEON_TRIM });
        for (const side of [-1, 1]) {
            // Lower body accent line
            const stripGeo = new THREE.BoxGeometry(0.03, 0.04, 3.8);
            const strip = new THREE.Mesh(stripGeo, trimMat);
            strip.position.set(side * 0.86, 0.55, 0);
            this.group.add(strip);

            // Upper door line
            const doorGeo = new THREE.BoxGeometry(0.03, 0.03, 1.4);
            const doorLine = new THREE.Mesh(doorGeo, trimMat);
            doorLine.position.set(side * 0.84, 0.85, -0.1);
            this.group.add(doorLine);
        }

        // ── Underglow (brighter, wider for visibility) ──
        const glowGeo = new THREE.PlaneGeometry(2.2, 5.0);
        const glowMat = new THREE.MeshBasicMaterial({
            color: NEON_UNDERGLOW,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.06;
        this.group.add(glow);
        this._underglow = glow;

        // ── Headlight glow cones (forward light volume) ──
        for (const side of [-0.55, 0.55]) {
            const coneGeo = new THREE.PlaneGeometry(0.6, 3.5);
            const coneMat = new THREE.MeshBasicMaterial({
                color: 0xffffdd, transparent: true, opacity: 0.08,
                side: THREE.DoubleSide, depthWrite: false,
            });
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.rotation.x = -Math.PI / 2;
            cone.position.set(side, 0.15, -3.7);
            this.group.add(cone);
        }

        // ── Wheels (Watanabe-style, wider, lower profile) ──
        const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });
        const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.19, 6);
        const hubMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.25 });

        this.wheels = [];
        const wheelPositions = [
            [-0.82, 0.28, -1.4],   // FL
            [0.82, 0.28, -1.4],    // FR
            [-0.82, 0.28, 1.4],    // RL
            [0.82, 0.28, 1.4],     // RR
        ];
        for (const [x, y, z] of wheelPositions) {
            const wheelGroup = new THREE.Group();
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheelGroup.add(wheel);

            const hub = new THREE.Mesh(hubGeo, hubMat);
            hub.rotation.z = Math.PI / 2;
            wheelGroup.add(hub);

            wheelGroup.position.set(x, y, z);
            this.group.add(wheelGroup);
            this.wheels.push(wheelGroup);
        }

        this.group.position.copy(this.position);
        this.scene.add(this.group);

        // ── Tail light trails ──
        this._trailSegments = 12;
        this._trails = [];
        for (const side of [-0.6, 0.6]) {
            const geo = new THREE.BufferGeometry();
            const positions = new Float32Array(this._trailSegments * 3);
            const alphas = new Float32Array(this._trailSegments);
            // Initialize all trail points at the taillight position
            for (let i = 0; i < this._trailSegments; i++) {
                positions[i * 3] = 0;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = 0;
                alphas[i] = 1.0 - i / this._trailSegments;
            }
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

            const mat = new THREE.ShaderMaterial({
                uniforms: { color: { value: new THREE.Color(0xff1122) } },
                vertexShader: `
                    attribute float alpha;
                    varying float vAlpha;
                    void main() {
                        vAlpha = alpha;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 color;
                    varying float vAlpha;
                    void main() {
                        gl_FragColor = vec4(color, vAlpha * 0.4);
                    }
                `,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });

            const line = new THREE.Line(geo, mat);
            line.frustumCulled = false;
            this.scene.add(line);
            this._trails.push({ line, side, localY: 0.6, localZ: 2.13 });
        }
    }

    _bindInput() {
        this._onKeyDown = (e) => {
            switch (e.code) {
                case 'KeyW': case 'ArrowUp': this.keys.forward = true; break;
                case 'KeyS': case 'ArrowDown': this.keys.backward = true; break;
                case 'KeyA': case 'ArrowLeft': this.keys.left = true; break;
                case 'KeyD': case 'ArrowRight': this.keys.right = true; break;
                case 'Space': this.keys.handbrake = true; break;
            }
        };
        this._onKeyUp = (e) => {
            switch (e.code) {
                case 'KeyW': case 'ArrowUp': this.keys.forward = false; break;
                case 'KeyS': case 'ArrowDown': this.keys.backward = false; break;
                case 'KeyA': case 'ArrowLeft': this.keys.left = false; break;
                case 'KeyD': case 'ArrowRight': this.keys.right = false; break;
                case 'Space': this.keys.handbrake = false; break;
            }
        };
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
    }

    unbindInput() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
    }

    update(dt) {
        // Throttle / brake from keys
        this.throttle = this.keys.forward ? 1 : 0;
        this.brake = this.keys.backward ? 1 : 0;
        this.handbrake = this.keys.handbrake;

        const wasDrifting = this.drifting;
        this.drifting = this.handbrake && Math.abs(this.velocity) > 3;

        // Drift entry — kick lateral velocity from current steering
        if (this.drifting && !wasDrifting) {
            const steerDir = this.steerAngle !== 0 ? Math.sign(this.steerAngle) : (Math.random() < 0.5 ? 1 : -1);
            this.lateralVelocity += steerDir * Math.abs(this.velocity) * this.driftLateralKick;
        }

        // Steering — more responsive when drifting
        const currentMaxSteer = this.drifting ? this.driftMaxSteer : this.maxSteer;
        const currentSteerSpeed = this.drifting ? this.steerSpeed * this.driftSteerMultiplier : this.steerSpeed;

        if (this.keys.left) {
            this.steerAngle = Math.min(this.steerAngle + currentSteerSpeed * dt, currentMaxSteer);
        } else if (this.keys.right) {
            this.steerAngle = Math.max(this.steerAngle - currentSteerSpeed * dt, -currentMaxSteer);
        } else {
            // Return to center
            if (this.steerAngle > 0) {
                this.steerAngle = Math.max(0, this.steerAngle - this.steerReturn * dt);
            } else if (this.steerAngle < 0) {
                this.steerAngle = Math.min(0, this.steerAngle + this.steerReturn * dt);
            }
        }

        // Acceleration
        if (this.throttle > 0) {
            this.velocity += this.acceleration * this.throttle * dt;
        }

        // Braking
        if (this.brake > 0) {
            this.velocity -= this.brakeForce * this.brake * dt;
        }

        // Drift physics — forward drag + lateral slide from steering
        if (this.drifting) {
            this.velocity *= Math.pow(0.55, dt);
            this.lateralVelocity += this.steerAngle * Math.abs(this.velocity) * dt * 1.2;
        } else {
            // Normal lateral friction
            if (Math.abs(this.lateralVelocity) > 0.01) {
                const lateralDecay = Math.pow(this.driftGrip, dt);
                this.lateralVelocity *= lateralDecay;
                if (Math.abs(this.lateralVelocity) < 0.5) {
                    this.lateralVelocity *= Math.pow(0.01, dt);
                }
            }
        }

        // Lateral friction (always, weaker when drifting)
        const latFriction = this.drifting ? this.driftLateralFriction * 0.3 : this.driftLateralFriction;
        if (this.lateralVelocity > 0) {
            this.lateralVelocity = Math.max(0, this.lateralVelocity - latFriction * dt);
        } else if (this.lateralVelocity < 0) {
            this.lateralVelocity = Math.min(0, this.lateralVelocity + latFriction * dt);
        }

        // Clamp lateral velocity
        const maxLateral = Math.abs(this.velocity) * 0.5;
        this.lateralVelocity = Math.max(-maxLateral, Math.min(this.lateralVelocity, maxLateral));

        // Normal friction
        if (this.throttle === 0 && this.brake === 0 && !this.drifting) {
            if (this.velocity > 0) {
                this.velocity = Math.max(0, this.velocity - this.friction * dt);
            } else if (this.velocity < 0) {
                this.velocity = Math.min(0, this.velocity + this.friction * dt);
            }
        }

        // Clamp speed
        this.velocity = Math.max(-this.maxSpeed * 0.3, Math.min(this.velocity, this.maxSpeed));

        // Turning (only at speed)
        const turnFactor = Math.min(1, Math.abs(this.velocity) / 5);
        const turnSign = this.velocity >= 0 ? 1 : -1;
        const turnRate = this.drifting ? 2.0 : 1.5;
        this.rotation.y += this.steerAngle * turnSign * turnFactor * dt * turnRate;

        // Position update — forward + lateral (reuse pre-allocated vectors)
        this._forward.set(0, 0, -1).applyEuler(this.rotation);
        this.position.addScaledVector(this._forward, this.velocity * dt);

        this._right.set(1, 0, 0).applyEuler(this.rotation);
        this.position.addScaledVector(this._right, this.lateralVelocity * dt);

        // Smoothly track ground height (set externally by main loop)
        const ySmooth = 1 - Math.exp(-12 * dt);
        this.position.y += (this.groundY - this.position.y) * ySmooth;

        // Update mesh position
        this.group.position.copy(this.position);

        // Visual drift angle — car body rotates into the slide
        const targetDriftAngle = this.drifting
            ? Math.atan2(this.lateralVelocity, Math.max(Math.abs(this.velocity), 1)) * 0.5
            : 0;
        this._driftAngle += (targetDriftAngle - this._driftAngle) * Math.min(1, 8 * dt);
        this.group.rotation.set(
            this.rotation.x,
            this.rotation.y + this._driftAngle,
            this.rotation.z
        );

        // Spin wheels
        const wheelSpin = this.velocity * dt * 3;
        for (const w of this.wheels) {
            w.children[0].rotation.x += wheelSpin; // tire
            w.children[1].rotation.x += wheelSpin; // hub
        }

        // Underglow — brighter when drifting
        if (this._underglow) {
            const baseOpacity = this.drifting ? 0.6 : 0.35;
            this._underglow.material.opacity = baseOpacity + 0.15 * Math.sin(Date.now() * 0.003);
        }

        // Tail light trails — shift positions backward, insert new head
        for (const trail of this._trails) {
            const pos = trail.line.geometry.attributes.position;
            const arr = pos.array;
            // Shift all points back by one slot
            for (let i = this._trailSegments - 1; i > 0; i--) {
                arr[i * 3] = arr[(i - 1) * 3];
                arr[i * 3 + 1] = arr[(i - 1) * 3 + 1];
                arr[i * 3 + 2] = arr[(i - 1) * 3 + 2];
            }
            // Compute world position of this taillight
            this._fwd.set(trail.side, trail.localY, trail.localZ);
            this.group.localToWorld(this._fwd);
            arr[0] = this._fwd.x;
            arr[1] = this._fwd.y;
            arr[2] = this._fwd.z;
            pos.needsUpdate = true;
        }
    }

    /* ── Collision ── */

    _updateBoundingBox() {
        // AE86 body is ~1.7 x 0.65 x 4.2
        const halfW = 0.85;
        const halfH = 0.65;
        const halfD = 2.1;
        const cosY = Math.abs(Math.cos(this.rotation.y));
        const sinY = Math.abs(Math.sin(this.rotation.y));

        const extX = halfW * cosY + halfD * sinY;
        const extZ = halfW * sinY + halfD * cosY;

        this.boundingBox.min.set(
            this.position.x - extX,
            this.position.y,
            this.position.z - extZ
        );
        this.boundingBox.max.set(
            this.position.x + extX,
            this.position.y + halfH * 2,
            this.position.z + extZ
        );
    }

    checkCollisions(collidables, dt) {
        this._updateBoundingBox();

        // Tick down cooldowns
        for (const [mesh, t] of this._collisionCooldowns) {
            const remaining = t - dt;
            if (remaining <= 0) this._collisionCooldowns.delete(mesh);
            else this._collisionCooldowns.set(mesh, remaining);
        }

        const collisions = [];
        let pushed = false;
        const PUSH_MARGIN = 0.05;

        for (const col of collidables) {
            if (pushed) this._updateBoundingBox();
            if (!this.boundingBox.intersectsBox(col.box)) continue;

            const overlapX1 = this.boundingBox.max.x - col.box.min.x;
            const overlapX2 = col.box.max.x - this.boundingBox.min.x;
            const overlapZ1 = this.boundingBox.max.z - col.box.min.z;
            const overlapZ2 = col.box.max.z - this.boundingBox.min.z;

            const minOverlapX = Math.min(overlapX1, overlapX2);
            const minOverlapZ = Math.min(overlapZ1, overlapZ2);

            let pushX = 0, pushZ = 0;
            if (minOverlapX < minOverlapZ) {
                pushX = (overlapX1 < overlapX2 ? -1 : 1) * (minOverlapX + PUSH_MARGIN);
            } else {
                pushZ = (overlapZ1 < overlapZ2 ? -1 : 1) * (minOverlapZ + PUSH_MARGIN);
            }

            const isNewCollision = !this._collisionCooldowns.has(col.mesh);

            switch (col.type) {
                case 'building':
                case 'barrier':
                case 'pole':
                    this.position.x += pushX;
                    this.position.z += pushZ;
                    pushed = true;

                    if (Math.abs(this.velocity) > 0.1) {
                        this._fwd.set(0, 0, -1).applyEuler(this.rotation);
                        const nx = pushX !== 0 ? Math.sign(pushX) : 0;
                        const nz = pushZ !== 0 ? Math.sign(pushZ) : 0;
                        const dot = this._fwd.x * nx + this._fwd.z * nz;
                        if (dot < 0) {
                            this.velocity *= Math.max(0, 1 + dot);
                        }
                    }
                    break;

                case 'traffic':
                    this.position.x += pushX * 1.5;
                    this.position.z += pushZ * 1.5;
                    pushed = true;
                    if (isNewCollision) {
                        this.velocity *= 0.2;
                        col.mesh.position.x -= pushX * 0.5;
                        col.mesh.position.z -= pushZ * 0.5;
                    }
                    break;

                case 'cone':
                    if (isNewCollision) {
                        this.velocity *= 0.9;
                        col.mesh.position.x += pushX * 3;
                        col.mesh.position.z += pushZ * 3;
                        col.mesh.position.y += 0.2;
                    }
                    break;
            }

            if (isNewCollision) {
                this._collisionCooldowns.set(col.mesh, this._collisionCooldownTime);
                collisions.push({ type: col.type, pushX, pushZ });
            }
        }

        if (pushed) {
            this.group.position.copy(this.position);
        }

        return collisions;
    }

    /* Getters for data collection */
    getSpeed() {
        return Math.abs(this.velocity) * 3.6; // km/h
    }

    getSteeringNormalized() {
        return this.steerAngle / this.maxSteer; // -1..1
    }

    getThrottle() {
        return this.throttle;
    }

    getBrake() {
        return this.brake;
    }

    getPosition() {
        return { x: this.position.x, y: this.position.y, z: this.position.z };
    }

    getRotation() {
        return { x: this.rotation.x, y: this.rotation.y, z: this.rotation.z };
    }
}
