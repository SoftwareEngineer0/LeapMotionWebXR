/**
 * Copyright 2021 Ultraleap, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as THREE from '../../../node_modules/three/build/three.module.js';
import oc from  '../../../node_modules/opencascade.js/dist/opencascade.wasm.module.js';
import { Tools } from './Tools.js';
import { InteractionRay } from '../Input/Input.js';
import { Grid } from './General/Grid.js';
import { Cursor } from './General/Cursor.js';

/** This class controls all of the SphereTool behavior */
class SphereTool {

    /** Create the SphereTool
     * @param {Tools} tools */
    constructor(tools) {
        this.tools  = tools;
        this.world  = this.tools.world;
        this.engine = this.tools.engine;
        this.oc = oc; this.shapes = {};

        this.state = -1; // -1 is Deactivated
        this.numSpheres = 0;
        this.distance = 0.001;
        this.point = new THREE.Vector3();
        this.snappedPoint = new THREE.Vector3();
        this.cameraRelativeMovement = new THREE.Vector3();
        this.rayPlane = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000),
                                       new THREE.MeshBasicMaterial());

        // Create Metadata for the Menu System
        this.loader = new THREE.TextureLoader(); this.loader.setCrossOrigin ('');
        this.icon = this.loader.load ((typeof ESBUILD !== 'undefined') ? './textures/Sphere.png' : '../../../textures/Sphere.png');
        this.descriptor = {
            name: "Sphere Tool",
            icon: this.icon
        }
    }

    /** Update the SphereTool's State Machine
     * @param {InteractionRay} ray The Current Input Ray */
    update(ray) {
        if (ray.hovering || this.state === -1) {
            return; // Tool is currently deactivated
        } else if(this.state === 0) {
            // Wait for the ray to be active and pointing at a drawable surface
            this.world.raycaster.set(ray.ray.origin, ray.ray.direction);
            let intersects = this.world.raycaster.intersectObject(this.world.scene, true);

            if (intersects.length > 0 && !ray.justDeactivated &&
               (intersects[0].object.shapeName || intersects[0].object.isGround)) {

                this.hit = intersects[0];
                // Shoot through the floor if necessary
                for (let i = 0; i < intersects.length; i++){
                    if (intersects[i].object.shapeName || intersects[i].object.isGround) {
                        this.hit = intersects[i]; break;
                    }
                }

                // Update the grid origin
                this.tools.grid.setVisible(true);
                this.tools.grid.updateWithHit(this.hit);
                this.tools.grid.snapToGrid(this.snappedPoint.copy(this.hit.point));
                this.tools.cursor.updateTarget(this.snappedPoint);
                let relativeSnapped = this.tools.grid.space.worldToLocal(this.snappedPoint.clone());
                this.tools.cursor.updateLabelNumbers(Math.abs(relativeSnapped.x), Math.abs(relativeSnapped.z));

                if (ray.active && this.tools.grid.updateCount > 1) {// iPhones need more than one frame
                    // Record the hit object and plane...
                    this.hitObject = this.hit.object;

                    this.point.copy(this.snappedPoint);

                    // Spawn the Sphere
                    this.currentSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 10), this.world.previewMaterial);
                    this.currentSphere.material.color.setRGB(0.5, 0.5, 0.5);
                    this.currentSphere.material.emissive.setRGB(0, 0.25, 0.25);
                    this.currentSphere.name = "Sphere #" + this.numSpheres;
                    this.currentSphere.position.copy(this.point);
                    this.currentSphere.frustumCulled = false;
                    this.currentSphere.scale.set(0.00001,0.00001,0.00001);
                    this.world.scene.add(this.currentSphere);
                    this.rayPlane.position.copy(this.point);
                    this.rayPlane.lookAt(this.hit.face.normal.clone().transformDirection(this.hit.object.matrixWorld).add(this.rayPlane.position));
                    this.rayPlane.updateMatrixWorld(true);

                    this.state += 1;
                }
                ray.hovering = true;
            }
        } else if(this.state === 1) {
            // While holding, resize the Sphere
            this.world.raycaster.set(ray.ray.origin, ray.ray.direction);
            let intersects = this.world.raycaster.intersectObject(this.rayPlane);
            if (intersects.length > 0) {
                // Get camera-space position to determine union or subtraction
                this.cameraRelativeMovement.copy(intersects[0].point.clone().sub(this.point));
                this.cameraRelativeMovement.transformDirection(this.world.camera.matrixWorld.invert());

                this.distance = Math.max(0.001, intersects[0].point.clone().sub(this.point).length());
                //if (this.tools.gridPitch > 0) { this.distance = Math.round(this.distance / this.tools.gridPitch) * this.tools.gridPitch; }
                this.distance = this.tools.grid.snapToGrid1D(this.distance);
                this.tools.cursor.updateTarget(this.point);
                this.tools.cursor.updateLabelNumbers(this.distance);

                this.currentSphere.scale.x = this.distance;
                this.currentSphere.scale.y = this.distance;
                this.currentSphere.scale.z = this.distance;
                this.distance *= Math.sign(this.cameraRelativeMovement.x);
                this.currentSphere.material.emissive.setRGB(
                    this.distance > 0 ? 0.0  : 0.25,
                    this.distance > 0 ? 0.25 : 0.0 , 0.0);
            }
            ray.hovering = true;

            // When let go, deactivate and add to Undo!
            if (!ray.active) {
                this.tools.grid.setVisible(false);
                this.createSphereGeometry(this.currentSphere,
                    [this.point.x, this.point.y, this.point.z, this.distance, this.hitObject.shapeName]);
                this.numSpheres += 1;
                this.currentSphere = null;
                this.deactivate();
            }
        }
    }

    /** @param {THREE.Mesh} sphereMesh */
    createSphereGeometry(sphereMesh, createSphereArgs) {
        // Early Exit if the Sphere is Trivially Invalid
        if (createSphereArgs[3] === 0.0) {
            this.tools.alerts.displayError("Zero Volume Sphere is Invalid!");
            sphereMesh.parent.remove(sphereMesh);
            this.world.dirty = true;
            return;
        }

        let shapeName = "Sphere #" + this.numSpheres;
        this.engine.execute(shapeName, this.createSphere, createSphereArgs,
            (mesh) => {
                if (mesh) {
                    mesh.name = sphereMesh.name;
                    mesh.shapeName = shapeName;
                    if (this.hitObject.shapeName) {
                        this.world.history.addToUndo(mesh, this.hitObject, "Sphere CSG");
                        this.hitObject = null;
                    } else {
                        this.world.history.addToUndo(mesh, null, "Sphere");
                    }
                }

                sphereMesh.parent.remove(sphereMesh);
                this.world.dirty = true;
            });
    }

    /** Create a Sphere in OpenCascade; to be executed on the Worker Thread */
    createSphere(x, y, z, radius, hitObjectName) {
        if (radius != 0) {
            let spherePlane = new this.oc.gp_Ax2(new this.oc.gp_Pnt(x, y, z), this.oc.gp.prototype.DZ());
            let shape = new this.oc.BRepPrimAPI_MakeSphere(spherePlane, Math.abs(radius)).Shape();

            if (hitObjectName in this.shapes) {
                let hitObject = this.shapes[hitObjectName];
                if (radius > 0) {
                    let union = new this.oc.BRepAlgoAPI_Fuse(hitObject, shape);
                    union.SetFuzzyValue(0.00000001);
                    union.Build();
                    return union.Shape();
                } else {
                    let differenceCut = new this.oc.BRepAlgoAPI_Cut(hitObject, shape);
                    differenceCut.SetFuzzyValue(0.00000001);
                    differenceCut.Build();
                    return differenceCut.Shape();
                }
            }
            return shape;
        }
    }

    activate() {
        if (this.tools.activeTool) {
            this.tools.activeTool.deactivate();
        }
        this.state = 0;
        this.tools.activeTool = this;
        this.tools.grid.updateCount = 0;
    }

    deactivate() {
        this.state = -1;
        this.tools.activeTool = null;
        if (this.currentSphere && this.currentSphere.parent) {
            this.currentSphere.parent.remove(this.currentSphere);
        }
        this.tools.grid.updateCount = 0;
        this.tools.grid.setVisible(false);
    }

    /** Whether or not to show this tool in the menu 
     * Only Show when no objects are selected */
    shouldShow() { return this.tools.tools[0].selected.length == 0; }
}

export { SphereTool };
