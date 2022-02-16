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

import { dedent } from "graphql-compose";
import { Node } from "../classes";
import { Context } from "../types";

type FulltextArg = { phrase: string; score_EQUAL?: number };

type GraphQLFulltextArg = FulltextArg | Record<string, FulltextArg>;

function createTopLevelMatchWhereAndParams({
    node,
    context,
    fulltextInput,
    varName,
}: {
    node: Node;
    context: Context;
    fulltextInput: GraphQLFulltextArg;
    varName: string;
}): [string, string[], Record<string, any>] {
    const params = {};
    const whereStrs: string[] = [];
    if (!Object.entries(fulltextInput).length) {
        return [`MATCH (${varName}${node.getLabelString(context)})`, whereStrs, params];
    }
    if (Object.entries(fulltextInput).length > 1) {
        throw new Error("Can only call one search at any given time");
    }

    const [indexName, indexInput] = Object.entries(fulltextInput)[0];
    const baseParamName = `${varName}_fulltext_${indexName}`;
    const paramPhraseName = `${baseParamName}_phrase`;
    params[paramPhraseName] = indexInput.phrase;

    if (node.nodeDirective?.additionalLabels?.length) {
        node.getLabels(context).forEach((label) => {
            whereStrs.push(`"${label}" IN labels(${varName})`);
        });
    }

    if (node.fulltextDirective) {
        const index = node.fulltextDirective.indexes.find((i) => i.name === indexName);
        let thresholdParamName = baseParamName;
        let threshold: number | undefined;

        if (indexInput.score_EQUAL) {
            thresholdParamName = `${thresholdParamName}_score_EQUAL`;
            threshold = indexInput.score_EQUAL;
        } else if (index?.defaultThreshold) {
            thresholdParamName = `${thresholdParamName}_defaultThreshold`;
            threshold = index.defaultThreshold;
        }

        if (threshold !== undefined) {
            params[thresholdParamName] = threshold;
            whereStrs.push(`score = ${thresholdParamName}`);
        }
    }
    return [
        dedent(`
          CALL db.index.fulltext.queryNodes(
              "${indexName}",
              $${paramPhraseName}
          ) YIELD node as this, score as score
      `),
        whereStrs,
        params,
    ];
}

export default createTopLevelMatchWhereAndParams;
