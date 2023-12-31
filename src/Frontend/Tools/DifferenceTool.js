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
import { snapToGrid } from './General/ToolUtils.js';

/** This class controls all of the DifferenceTool behavior */
class DifferenceTool {

    /** Create the DifferenceTool
     * @param {Tools} tools */
    constructor(tools) {
        this.tools  = tools;
        this.world  = this.tools.world;
        this.engine = this.tools.engine;
        this.oc = oc; this.shapes = {};

        this.state = -1; // -1 is Deactivated
        this.numDifferences = 0;

        // Create Metadata for the Menu System
        this.loader = new THREE.TextureLoader(); this.loader.setCrossOrigin ('');
        this.icon = this.loader.load ((typeof ESBUILD !== 'undefined') ? './textures/Difference.png' : '../../../textures/Difference.png' );
        this.descriptor = {
            name: "Difference Tool",
            icon: this.icon
        }
    }

    activate() {
        // Get Selected Objects
        this.selected = this.tools.tools[0].selected;
        if (this.selected.length > 1) {
            this.selectedShapes = [];
            for (let i = 0; i < this.selected.length; i++) {
                this.selectedShapes.push(this.selected[i].shapeName);
            }

            this.createDifferenceGeometry(this.selected, [this.selectedShapes]);
            this.numDifferences += 1;
        }

        this.deactivate();
    }

    deactivate() {
        this.state = -1;
        this.tools.activeTool = null;
    }

    /** Update the DifferenceTool's State Machine
     * @param {InteractionRay} ray The Current Input Ray */
    update(ray) { return; }

    /** @param {THREE.Mesh[]} differenceMeshes */
    createDifferenceGeometry(differenceMeshes, createDifferenceArgs) {
        let shapeName = "Difference #" + this.numDifferences;
        this.engine.execute(shapeName, this.createDifference, createDifferenceArgs,
            (mesh) => {
                if (mesh) {
                    mesh.name = shapeName;
                    mesh.shapeName = shapeName;
                    this.tools.tools[0].clearSelection();

                    // Creation of the Final Subtracted Difference Object
                    this.world.history.addToUndo(mesh, null, "Subtraction");

                    // Individually Undoable Removal of Cutting Tools
                    for (let s = 0; s < differenceMeshes.length; s++){
                        this.world.history.removeShape(differenceMeshes[s], "Original Shape");
                    }
                }
                this.world.dirty = true;
            });
    }

    /** Create a Difference in OpenCascade; to be executed on the Worker Thread */
    createDifference(differenceObjects) {
        if (differenceObjects.length >= 2) {
            let cut = false;
            let shape = this.shapes[differenceObjects[0]];

            for (let s = 1; s < differenceObjects.length; s++){
                let cuttingTool = this.shapes[differenceObjects[s]];

                // Check to see if shape and fuseTool are touching
                let overlapChecker = new this.oc.BRepExtrema_DistShapeShape(shape, cuttingTool);
                overlapChecker.Perform();

                if (overlapChecker.Value() <= 0 || overlapChecker.InnerSolution()) {
                    let differenceOp = new this.oc.BRepAlgoAPI_Cut(shape, cuttingTool);
                    differenceOp.SetFuzzyValue(0.00001); differenceOp.Build();
                    shape = differenceOp.Shape();
                    cut = true;
                } else { console.error("Skipping Shape; not touching..."); continue; }
            }

            return cut ? shape : null;
        } else {
            console.error("Cannot Diff; fewer than two objects in the selection...");
        }
    }

    /** Whether or not to show this tool in the menu */
    shouldShow() { return this.tools.tools[0].selected.length >= 2; }
}

export { DifferenceTool };
