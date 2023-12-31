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

import * as THREE from '../../../../node_modules/three/build/three.module.js';
import { TextMesh } from '../../World/TextMesh.js';

/** This is an in-scene helper for measurements and precision placement. */
class Alerts {
    
    /** Initialize the Alerts
     * @param {Tools} tools */
    constructor(tools) {
        // Store a reference to the World
        this.tools = tools;
        this.world = tools.world;
        this.engine = this.world.parent.engine;
        this.cursor = this.tools.cursor;

        this.alerts = new THREE.Group();
        this.alerts.name = "Alerts";
        this.alerts.layers.set(1); // Ignore Raycasts

        this.targetPosition = new THREE.Vector3();
        this.lastTimeTargetUpdated = performance.now();
        this.position = this.alerts.position;
        this.hitObject = null;
        this.vec1 = new THREE.Vector3(); this.vec2 = new THREE.Vector3();
        this.quat = new THREE.Quaternion();
        this.fadeTime = 5000;

        // Create a Text Updating Label for the General Alert Data
        this.labels = [];
        for (let i = 0; i < 5; i++) {
            let label = new TextMesh("");
            label.layers.set(1); // Ignore Raycasts
            label.frustumCulled = false;
            this.alerts.add (label);
            this.labels.push(label);
        }

        this.world.scene.add(this.alerts);
    }

    update() {
        if (performance.now() - this.lastTimeTargetUpdated < this.fadeTime) {
            let alpha = this.alerts.visible ? 0.25 : 1.0;

            this.alerts.visible = true;

            // Lerp the Alerts to the Target Position
            this.alerts.position.lerp(this.cursor.targetPosition, alpha);

            // Make the Alerts Contents Face the Camera
            this.alerts.quaternion.slerp(this.world.camera.getWorldQuaternion(this.quat), alpha);

            this.alerts.scale.copy(this.world.camera.getWorldScale(this.vec1));

            // Lerp the Alerts to Stack on top of each other
            for (let i = 0; i < this.labels.length; i++){
                let age = performance.now() - this.labels[i].lastUpdated;
                if (age < this.labels[i].displayTime) {
                    this.labels[i].visible = true;
                    this.labels[i].material.opacity = (this.labels[i].displayTime - age) / this.labels[i].displayTime;
                    
                    this.labels[i].position.y =
                        (this.labels[i].position.y   * (1.0 - 0.25)) +
                        (this.labels[i].targetHeight * (      0.25));
                } else {
                    this.labels[i].visible = false;
                }
            }

        } else {
            this.alerts.visible = false;
        }
    }

    displayInfo(text, r = 0, g = 0, b = 0, time = 2000) {
        // Move end label to the beginning
        this.labels.splice(0, 0, this.labels.splice(this.labels.length - 1, 1)[0]); 
        // Render HTML Element's Text to the Mesh
        this.labels[0].update(text, r, g, b);
        this.labels[0].lastUpdated = performance.now();
        this.labels[0].displayTime = time||2000;

        // Update the target height to stack the labels on top of eachother
        let curTargetHeight = this.labels[0].canonicalPosition.y * 2;
        for (let i = 0; i < this.labels.length; i++){
            this.labels[i].targetHeight = curTargetHeight;
            curTargetHeight += this.labels[i].scale.y;
        }

        this.lastTimeTargetUpdated = performance.now();
    }

    displayError(text) {
        this.displayInfo(text, 255, 0, 0, 5000);
    }
}

export { Alerts };
