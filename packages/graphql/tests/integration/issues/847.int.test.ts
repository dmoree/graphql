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

import gql from "graphql-tag";
import { graphql } from "graphql";
import { Driver } from "neo4j-driver";
import { generate } from "randomstring";
import { Neo4jGraphQL } from "../../../src/classes";
import neo4j from "../neo4j";

const testLabel = generate({ charset: "alphabetic" });

describe("583", () => {
    let driver: Driver;

    const typeDefs = gql`
        interface Entity {
            id: String!
        }

        type Person implements Entity {
            id: String! @unique
            name: String!
        }

        type Place implements Entity {
            id: String! @unique
            location: Point!
        }

        type Interaction {
            id: ID!
            kind: String!
            subjects: [Entity!]! @relationship(type: "ACTED_IN", direction: IN)
            objects: [Entity!]! @relationship(type: "ACTED_IN", direction: OUT)
        }
    `;

    const { schema } = new Neo4jGraphQL({ typeDefs });

    const people = [
        {
            id: generate(),
            name: "Adam",
        },
        {
            id: generate(),
            name: "Eve",
        },
        {
            id: generate(),
            name: "Cain",
        },
    ];

    const interaction = {
        id: generate(),
        kind: "PARENT_OF",
    };

    beforeAll(async () => {
        driver = await neo4j();
        const session = driver.session();

        await session.run(
            `
            CREATE (adam:Person:${testLabel}) SET adam = $people[0]
            CREATE (eve:Person:${testLabel}) SET eve = $people[1]
            CREATE (cain:Person:${testLabel}) SET cain = $people[2]

            CREATE (interaction:Interaction:${testLabel}) SET interaction = $interaction
           
            CREATE (adam)-[:ACTED_IN]->(interaction)<-[:ACTED_IN]-(eve)
            CREATE (interaction)-[:ACTED_IN]->(cain)
          `,
            { people, interaction }
        );
        await session.close();
    });

    afterAll(async () => {
        const session = driver.session();

        await session.run(`MATCH (node:${testLabel}) DETACH DELETE node`);
        await session.close();

        await driver.close();
    });

    test("should project all interfaces of node", async () => {
        const query = gql`
            query ($interactionId: ID!) {
                interactions(where: { id: $interactionId }) {
                    id
                    subjects {
                        id
                    }
                    s: subjects {
                        id
                    }
                    objects {
                        id
                    }
                    o: objects {
                        id
                    }
                }
            }
        `;
        const gqlResult = await graphql({
            schema,
            source: query.loc!.source,
            variableValues: { interactionId: interaction.id },
            contextValue: { driver },
        });

        expect(gqlResult.errors).toBeFalsy();

        const gqlInteractions = (gqlResult?.data as any)?.interactions;
        expect(gqlInteractions).toHaveLength(1);
        expect(gqlInteractions).toContainEqual({
            id: interaction.id,
            subjects: expect.arrayContaining([{ id: people[0].id }, { id: people[1].id }]),
            s: expect.arrayContaining([{ id: people[0].id }, { id: people[1].id }]),
            objects: expect.arrayContaining([{ id: people[2].id }]),
            o: expect.arrayContaining([{ id: people[2].id }]),
        });
    });
});
