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
import { hasFragmentDepth, createDitherDepthFragmentShader } from "./General/ToolUtils.js";

/** This class controls all of the OffsetTool behavior */
class OffsetTool {

    /** Create the OffsetTool
     * @param {Tools} tools */
    constructor(tools) {
        this.tools  = tools;
        this.world  = this.tools.world;
        this.engine = this.tools.engine;
        this.oc = oc; this.shapes = {};

        this.state = -1; // -1 is Deactivated
        this.numOffsets = 0;
        this.distance = 1;
        this.vec = new THREE.Vector3(); this.quat = new THREE.Quaternion();
        this.point = new THREE.Vector3();
        this.snappedPoint = new THREE.Vector3();
        this.cameraRelativeMovement = new THREE.Vector3();
        this.rayPlane = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000),
                                       new THREE.MeshBasicMaterial());
        let hasFragDepth = hasFragmentDepth(this.world);
        this.offsetMaterial = this.world.previewMaterial.clone();
        this.offsetMaterial.uniforms = {};
        if (hasFragDepth) { this.offsetMaterial.extensions = { fragDepth: hasFragDepth }; } // set to use fragment depth values
        this.offsetMaterial.onBeforeCompile = ( shader ) => {
            // Vertex Shader: Dilate Vertex positions by the normals
            let insertionPoint = shader.vertexShader.indexOf("#include <displacementmap_vertex>");
            shader.vertexShader =
               '\nuniform float dilation;\n' +
               shader.vertexShader.slice(0, insertionPoint) +
                'transformed += dilation * objectNormal;\n    ' +
               shader.vertexShader.slice(   insertionPoint);

            if (hasFragDepth) {
                shader.fragmentShader = createDitherDepthFragmentShader(hasFragDepth, shader.fragmentShader);
            }

            shader.uniforms.dilation = { value: 0.0 };
            this.offsetMaterial.uniforms = shader.uniforms;
            this.offsetMaterial.userData.shader = shader;
        };

        // Create Metadata for the Menu System
        this.loader = new THREE.TextureLoader(); this.loader.setCrossOrigin ('');
        this.icon = this.loader.load ((typeof ESBUILD !== 'undefined') ? './textures/Offset.png' : '../../../textures/Offset.png');
        this.descriptor = {
            name: "Offset Tool",
            icon: this.icon
        }
    }

    /** Update the OffsetTool's State Machine
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

                // Record the hit object and plane...
                if (this.hit.object.shapeName) {
                    if (ray.justActivated) {
                        this.hitObject = this.hit.object;
                        this.point.copy(this.hit.point);
                        //this.hitObject.material = this.offsetMaterial;

                        // Spawn the Offset
                        this.currentOffset = new THREE.Mesh(this.hitObject.geometry, this.offsetMaterial);
                        this.offsetMaterial.emissive.setRGB(0, 0.25, 0.25);
                        this.currentOffset.name = "Waiting...";
                        this.world.scene.add(this.currentOffset);

                        // Creates an expected offset 
                        this.createPreviewOffsetGeometry([this.hitObject.shapeName, 0.002]);

                        this.rayPlane.position.copy(this.point);
                        this.rayPlane.lookAt(this.world.camera.getWorldPosition(this.vec));
                        this.rayPlane.updateMatrixWorld(true);

                        this.state += 1;
                    }
                    ray.hovering = true;
                }
            }
        } else if(this.state === 1) {
            // While holding, resize the Offset
            this.world.raycaster.set(ray.ray.origin, ray.ray.direction);
            let intersects = this.world.raycaster.intersectObject(this.rayPlane);
            if (intersects.length > 0) {
                // Get camera-space position to determine union or subtraction
                this.cameraRelativeMovement.copy(intersects[0].point.clone().sub(this.point));
                this.cameraRelativeMovement.applyQuaternion(this.world.camera.getWorldQuaternion(this.quat).invert());

                this.distance = this.cameraRelativeMovement.x;
                this.distance = this.tools.grid.snapToGrid1D(this.distance, this.tools.grid.gridPitch/5);

                // Update the Visual Feedback
                this.offsetMaterial.uniforms.dilation = { value: this.currentOffset.name === "Waiting..." ? this.distance : this.distance - 0.002 };
                this.offsetMaterial.side = this.distance < 0 ? THREE.BackSide : THREE.FrontSide;
                this.offsetMaterial.needsUpdate = true;
                if (this.currentOffset.name !== "Waiting...") {
                    if (this.distance < 0 && this.currentOffset.geometry === this.currentOffset.dilatedGeometry) {
                        this.currentOffset.geometry = this.currentOffset.contractedGeometry;
                        this.currentOffset.geometry.needsUpdate = true;
                    } else if (this.distance > 0 && this.currentOffset.geometry === this.currentOffset.contractedGeometry) {
                        this.currentOffset.geometry = this.currentOffset.dilatedGeometry;
                        this.currentOffset.geometry.needsUpdate = true;
                    }
                }

                this.tools.cursor.updateTarget(this.point);
                this.tools.cursor.updateLabelNumbers(this.distance);

                //this.currentOffset.scale.x = this.distance;
                //this.currentOffset.scale.y = this.distance;
                //this.currentOffset.scale.z = this.distance;
                this.offsetMaterial.emissive.setRGB(
                    this.distance > 0 ? 0.0  : 0.25,
                    this.distance > 0 ? 0.25 : 0.0 , 0.0);
            }
            ray.hovering = true;

            // When let go, deactivate and add to Undo!
            if (!ray.active) {
                this.createOffsetGeometry(this.hitObject,
                    [this.hitObject.shapeName, this.distance]);
                this.numOffsets += 1;
                //this.currentOffset = null;
                this.deactivate();
            }
        }
    }

    /** @param {THREE.Mesh} offsetMesh */
    createOffsetGeometry(offsetMesh, createOffsetArgs) {
        let shapeName = "Offset " + offsetMesh.shapeName;
        this.engine.execute(shapeName, this.createOffset, createOffsetArgs,
            (mesh) => {
                if (this.currentOffset) {
                    this.world.scene.remove(this.currentOffset);
                }

                if (mesh) {
                    mesh.name = offsetMesh.name;
                    mesh.shapeName = shapeName;
                    let friendlyName = (createOffsetArgs[1] > 0) ? "Expansion" : "Hollowing";
                    if (this.hitObject.shapeName) {
                        this.world.history.addToUndo(mesh, this.hitObject, friendlyName);
                        this.hitObject = null;
                    } else {
                        this.world.history.addToUndo(mesh, null, friendlyName);
                    }
                }

                offsetMesh.material = this.world.shapeMaterial;
                this.world.dirty = true;
            });
    }

    /** Creates an unit offset for previewing */
    createPreviewOffsetGeometry(createOffsetArgs) {
        let shapeName = "Offset #" + this.numOffsets;
        this.engine.execute(shapeName, this.createOffset, createOffsetArgs,
            (mesh) => {
                if (mesh) {
                    if (this.currentOffset) {
                        this.world.scene.remove(this.currentOffset);
                    }

                    mesh.shapeName = shapeName;
                    mesh.material = this.offsetMaterial;
                    mesh.dilatedGeometry = mesh.geometry;
                    mesh.contractedGeometry = this.currentOffset.geometry;
                    this.currentOffset = mesh;
                    this.currentOffset.children[0].visible = false;
                    this.world.scene.add(this.currentOffset);
                }
                this.world.dirty = true;
            });
    }

    /** Create a Offset in OpenCascade; to be executed on the Worker Thread */
    createOffset(hitObjectName, offsetDistance) {
        let inShape = this.shapes[hitObjectName];
        //if (offsetDistance === 0) { return inShape; }
        if (offsetDistance !== 0) {
            let offsetOp = new this.oc.BRepOffsetAPI_MakeOffsetShape();
            offsetOp.PerformByJoin(inShape, offsetDistance, 0.00001);
            let outShape = new this.oc.TopoDS_Shape(offsetOp.Shape());

            // Convert Shell to Solid as is expected
            if (outShape.ShapeType() == 3) {
              let solidOffset = new this.oc.BRepBuilderAPI_MakeSolid();
              solidOffset.Add(outShape);
              outShape = new this.oc.TopoDS_Solid(solidOffset.Solid());
            }

            if (offsetDistance > 0) {
                return outShape;
            } else {
                // Doesn't seem to work; not sure why...
                //let emptyList = new this.oc.TopTools_ListOfShape();
                //let hollowOp = new this.oc.BRepOffsetAPI_MakeThickSolid();
                //hollowOp.MakeThickSolidByJoin(inShape, emptyList, offsetDistance, 0.00001);
                //hollowOp.Build();
                //return hollowOp.Shape();
                let differenceCut = new this.oc.BRepAlgoAPI_Cut(inShape, outShape);
                differenceCut.SetFuzzyValue(0.00001);
                differenceCut.Build();
                return differenceCut.Shape();
            }
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
        //if (this.currentOffset && this.currentOffset.parent) {
        //    this.currentOffset.parent.remove(this.currentOffset);
        //}
        this.tools.grid.updateCount = 0;
        this.tools.grid.setVisible(false);
    }

    /** Whether or not to show this tool in the menu 
     * Only Show when no objects are selected */
    shouldShow() { return this.tools.tools[0].selected.length == 0; }
}

export { OffsetTool };
