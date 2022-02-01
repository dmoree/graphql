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

import { gql } from "apollo-server";
import { DocumentNode } from "graphql";
import { Neo4jGraphQL } from "../../../../src";
import { createJwtRequest } from "../../../utils/create-jwt-request";
import { formatCypher, translateQuery, formatParams } from "../../utils/tck-test-utils";

describe("https://github.com/neo4j/graphql/issues/879", () => {
    const secret = "secret";
    let typeDefs: DocumentNode;
    let neoSchema: Neo4jGraphQL;

    beforeAll(() => {
        typeDefs = gql`
            type Object {
                id: ID!
                children: [Object!]! @relationship(type: "CHILDREN", direction: OUT)
                user: [User!]! @relationship(type: "MEMBER_OF", direction: IN)

                allUsersOfChildren: [User!]!
                    @cypher(
                        statement: """
                        MATCH (this)-[:CHILDREN*]->(:Object)<-[:MEMBER_OF]-(user:User) RETURN user
                        """
                    )
            }

            type User {
                id: ID!
                object: Object! @relationship(type: "MEMBER_OF", direction: OUT)
            }
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
            config: { enableRegex: true, jwt: { secret } },
        });
    });

    test("Cypher Connection", async () => {
        const query = gql`
            query {
                objects {
                    id
                    allUsersOfChildrenConnection(first: 2, where: { node: { id: "objectId" } }) {
                        edges {
                            node {
                                id
                                object {
                                    id
                                }
                            }
                        }
                    }
                }
            }
        `;

        const req = createJwtRequest("secret", {});
        const result = await translateQuery(neoSchema, query, {
            req,
        });

        expect(formatCypher(result.cypher)).toMatchInlineSnapshot(`
            "MATCH (this:Object)
            CALL {
            WITH this
            CALL {
            WITH this
            MATCH (this)-[:CHILDREN*]->(:Object)<-[:MEMBER_OF]-(user:User) RETURN user
            }
            WITH user AS this_allUsersOfChildren
            WHERE this_allUsersOfChildren.id = $this_allUsersOfChildrenConnection.args.where.node.id
            WITH collect({ node: { id: this_allUsersOfChildren.id, object: head([ (this_allUsersOfChildren)-[:MEMBER_OF]->(this_allUsersOfChildren_object:Object)   | this_allUsersOfChildren_object { .id } ]) }}) AS edges
            WITH size(edges) AS totalCount, edges[..2] AS limitedSelection
            RETURN { edges: limitedSelection, totalCount: totalCount } AS allUsersOfChildrenConnection
            }
            RETURN this { .id, allUsersOfChildrenConnection } as this"
        `);

        expect(formatParams(result.params)).toMatchInlineSnapshot(`
            "{
                \\"this_allUsersOfChildrenConnection\\": {
                    \\"args\\": {
                        \\"where\\": {
                            \\"node\\": {
                                \\"id\\": \\"objectId\\"
                            }
                        }
                    }
                }
            }"
        `);
    });
});
