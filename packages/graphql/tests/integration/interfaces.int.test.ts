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

import { Driver } from "neo4j-driver";
import { graphql } from "graphql";
import { faker } from "@faker-js/faker";
import { gql } from "apollo-server";
import { generate } from "randomstring";
import neo4j from "./neo4j";
import { Neo4jGraphQL } from "../../src/classes";

const testLabel = generate({ charset: "alphabetic" });
describe("interfaces", () => {
    let driver: Driver;
    let neoSchema: Neo4jGraphQL;

    const typeDefs = gql`
        interface Production {
            title: String!
        }

        type Movie implements Production {
            title: String!
            runtime: Int!
        }

        type Series implements Production {
            title: String!
            episodes: Int!
        }
    `;

    const movie = {
        title: generate({ charset: "alphabetic", readable: true }),
        runtime: faker.datatype.number(),
    };

    const series = {
        title: generate({ charset: "alphabetic", readable: true }),
        episodes: faker.datatype.number(),
    };

    beforeAll(async () => {
        driver = await neo4j();

        neoSchema = new Neo4jGraphQL({
            typeDefs,
        });
        const session = driver.session();
        await session.run(
            `
          CREATE (movie:Movie:${testLabel}) SET movie = $movie
          CREATE (series:Series:${testLabel}) SET series = $series
        `,
            { movie, series }
        );
        await session.close();
    });

    afterAll(async () => {
        const session = driver.session();
        await session.run(`MATCH (n:${testLabel}) DETACH DELETE n`);
        await session.close();
        await driver.close();
    });

    test("should read and return interface at top level", async () => {
        const query = gql`
            query {
                productions {
                    title
                    ... on Movie {
                        runtime
                    }
                    ... on Series {
                        episodes
                    }
                }
            }
        `;
        const gqlResult = await graphql({
            schema: await neoSchema.getSchema(),
            source: query.loc!.source,
            contextValue: { driver },
        });

        expect(gqlResult.errors).toBeFalsy();
    });
});
