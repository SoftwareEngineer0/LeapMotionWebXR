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

import ConvertGeometry from './GeometryConverter.js';

/**
 * This is the CAD Engine for LeapShape;
 * all CAD Operations are managed through here.
 */
class LeapShapeEngine {
    /** Initializes the CAD Worker Thread and Callback System */
    constructor() {
        this.started = false;

        // Initialize the OpenCascade Worker Thread
        if (typeof ESBUILD !== 'undefined') {
            this.worker = new Worker(new URL( './Backend/mainWorker.js', import.meta.url )/*, { type: "module" }*/);
        } else {
            this.worker = new Worker('../src/Backend/mainWorker.js'/*, { type: "module" }*/);
        }

        // Ping Pong Messages Back and Forth based on their registration in messageHandlers
        this.messageHandlers = {}; this.executeHandlers = {};
        this.worker.onmessage = (e) => {
            if(e.data.type in this.messageHandlers){
                let response = this.messageHandlers[e.data.type](e.data.payload);
                if (response) { this.worker.postMessage({ "type": e.data.type, payload: response }) };
            }
        }
        this.registerCallback("startupCallback", () => { console.log("Worker Started!"); this.started = true; });

        // Handle Receiving Execution Results from the Engine
        this.executionQueue = [];
        this.registerCallback("execute", (payload) => {
            this.workerWorking = false; // Free the worker up to take more requests
            this.executeHandlers[payload.name](
                payload.payload ? payload.payload.isMetadata ? payload.payload : ConvertGeometry(payload.payload) : null);

            // Dequeue 
            if (this.executionQueue.length > 0) { this.execute(...this.executionQueue.pop());}
        });

        this.workerWorking = false;
    }

    /** Registers a callback from the Worker Thread 
     * @param {string} name Name of the callback
     * @param {function} callback The Callback to Execute */
    registerCallback(name, callback) { this.messageHandlers[name] = callback; }

    /** Registers a callback from the Worker Thread 
     * @param {string}   name               Unique Identifier for this Callback
     * @param {function} shapeOperation     Function that creates the TopoDS_Shape to mesh
     * @param {number[]} operationArguments Arguments to the shape operation function
     * @param {function} meshDataCallback   A callback containing the mesh data for this shape */
    execute(name, shapeOperation, operationArguments, meshDataCallback) {
        // Queue Requests if the worker is busy
        if (this.workerWorking) { this.executionQueue.push(arguments); return; }

        this.workerWorking = true;
        this.executeHandlers[name] = meshDataCallback;
        this.worker.postMessage({ "type": "execute", payload: {
            name: name,
            shapeFunction: shapeOperation.toString(),
            shapeArguments: operationArguments
        }});
    }
}

export { LeapShapeEngine };
