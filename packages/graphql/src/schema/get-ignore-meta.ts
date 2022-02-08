/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { FieldDefinitionNode, Kind } from "graphql";
import { IgnoreMeta } from "../types";

export const ERROR_MESSAGE = "Required fields of @ignore must be a list of strings";

function getIgnoreMeta(field: FieldDefinitionNode, interfaceField?: FieldDefinitionNode): IgnoreMeta | undefined {
    const directive =
        field.directives?.find((x) => x.name.value === "ignore") ||
        interfaceField?.directives?.find((x) => x.name.value === "ignore");
    if (!directive) {
        return undefined;
    }

    const directiveDependsOn = directive.arguments?.find((arg) => arg.name.value === "dependsOn");

    if (!directiveDependsOn) {
        return {
            selection: undefined,
        };
    }

    if (directiveDependsOn?.value.kind !== Kind.STRING) {
        throw new Error(ERROR_MESSAGE);
    }

    return {
        selection: directiveDependsOn.value.value,
    };
}

export default getIgnoreMeta;
