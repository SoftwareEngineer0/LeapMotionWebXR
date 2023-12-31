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

/** This class controls all of the UnionTool behavior */
class UnionTool {

    /** Create the UnionTool
     * @param {Tools} tools */
    constructor(tools) {
        this.tools  = tools;
        this.world  = this.tools.world;
        this.engine = this.tools.engine;
        this.oc = oc; this.shapes = {};

        this.state = -1; // -1 is Deactivated
        this.numUnions = 0;

        // Create Metadata for the Menu System
        this.loader = new THREE.TextureLoader(); this.loader.setCrossOrigin ('');
        this.icon = this.loader.load ((typeof ESBUILD !== 'undefined') ? './textures/Union.png' : '../../../textures/Union.png' );
        this.descriptor = {
            name: "Union Tool",
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

            this.createUnionGeometry(this.selected, [this.selectedShapes]);
            this.numUnions += 1;
        }

        this.deactivate();
    }

    deactivate() {
        this.state = -1;
        this.tools.activeTool = null;
    }

    /** Update the UnionTool's State Machine
     * @param {InteractionRay} ray The Current Input Ray */
    update(ray) { return; }

    /** @param {THREE.Mesh[]} unionMeshes */
    createUnionGeometry(unionMeshes, createUnionArgs) {
        let shapeName = "Union #" + this.numUnions;
        this.engine.execute(shapeName, this.createUnion, createUnionArgs,
            (mesh) => {
                if (mesh) {
                    mesh.name = shapeName;
                    mesh.shapeName = shapeName;
                    this.tools.tools[0].clearSelection();

                    // Creation of the Final Composite Unioned Object
                    this.world.history.addToUndo(mesh, null, "Union Object");

                    // Individually Undoable Removal of Union Constituents
                    for (let s = 0; s < unionMeshes.length; s++){
                        this.world.history.removeShape(unionMeshes[s], "Original Shape");
                    }
                }
                this.world.dirty = true;
            });
    }

    /** Create a Union in OpenCascade; to be executed on the Worker Thread */
    createUnion(unionObjects) {
        if (unionObjects.length >= 2) {
            let fused = false;
            let shape = this.shapes[unionObjects[0]];
            console.log(unionObjects);

            for (let i = 1; i < unionObjects.length; i++){
                let fuseTool = this.shapes[unionObjects[i]];

                console.log(shape, fuseTool);

                // Check to see if shape and fuseTool are touching
                //let overlapChecker = new this.oc.BRepExtrema_DistShapeShape(shape, fuseTool);
                //overlapChecker.Perform();

                //if (overlapChecker.InnerSolution()) {
                    let union = new this.oc.BRepAlgoAPI_Fuse(shape, fuseTool);
                    union.SetFuzzyValue(0.00001); union.Build();
                    shape = union.Shape();
                    fused = true;
                //}
            }

            return fused ? shape : null;
        }
    }

    /** Whether or not to show this tool in the menu */
    shouldShow() { return this.tools.tools[0].selected.length >= 2; }
}

export { UnionTool };
