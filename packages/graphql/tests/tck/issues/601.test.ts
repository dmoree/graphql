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
import type { DocumentNode } from "graphql";
import { Neo4jGraphQL } from "../../../src";
import { createJwtRequest } from "../../utils/create-jwt-request";
import { formatCypher, translateQuery, formatParams } from "../utils/tck-test-utils";

describe("#601", () => {
    let typeDefs: DocumentNode;
    let neoSchema: Neo4jGraphQL;

    beforeAll(() => {
        typeDefs = gql`
            interface UploadedDocument @relationshipProperties {
                fileId: ID!
                uploadedAt: DateTime!
            }

            type Document @exclude(operations: [CREATE, UPDATE, DELETE]) {
                id: ID! @id
                stakeholder: Stakeholder! @relationship(type: "REQUIRES", direction: OUT)

                customerContact: CustomerContact!
                    @relationship(type: "UPLOADED", properties: "UploadedDocument", direction: IN)
            }

            extend type Document @auth(rules: [{ roles: ["view"] }])

            type CustomerContact @exclude(operations: [CREATE, UPDATE, DELETE]) {
                email: String!
                firstname: String!
                lastname: String!
                documents: [Document!]! @relationship(type: "UPLOADED", properties: "UploadedDocument", direction: OUT)
            }

            extend type CustomerContact @auth(rules: [{ roles: ["view"] }])

            type Stakeholder @exclude(operations: [CREATE, UPDATE, DELETE]) {
                id: ID!
                fields: String!
                documents: [Document!]! @relationship(type: "REQUIRES", direction: OUT)
            }

            extend type Stakeholder @auth(rules: [{ roles: ["view"] }])
        `;

        neoSchema = new Neo4jGraphQL({
            typeDefs,
            config: { enableRegex: true },
        });
    });

    test("Example 1", async () => {
        const query = gql`
            query Document {
                stakeholders {
                    documents {
                        customerContactConnection {
                            edges {
                                fileId
                                uploadedAt
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
            "MATCH (this:\`Stakeholder\`)
            CALL {
                WITH this
                MATCH (this)-[thisthis0:REQUIRES]->(this_documents:\`Document\`)
                WHERE apoc.util.validatePredicate(NOT (any(thisvar2 IN [\\"view\\"] WHERE any(thisvar1 IN $auth.roles WHERE thisvar1 = thisvar2))), \\"@neo4j/graphql/FORBIDDEN\\", [0])
                CALL {
                WITH this_documents
                MATCH (this_documents)<-[this_documents_uploaded_relationship:UPLOADED]-(this_documents_customercontact:CustomerContact)
                CALL apoc.util.validate(NOT (any(auth_var1 IN [\\"view\\"] WHERE any(auth_var0 IN $auth.roles WHERE auth_var0 = auth_var1))), \\"@neo4j/graphql/FORBIDDEN\\", [0])
                WITH collect({ fileId: this_documents_uploaded_relationship.fileId, uploadedAt: apoc.date.convertFormat(toString(this_documents_uploaded_relationship.uploadedAt), \\"iso_zoned_date_time\\", \\"iso_offset_date_time\\") }) AS edges
                UNWIND edges as edge
                WITH collect(edge) AS edges, size(collect(edge)) AS totalCount
                RETURN { edges: edges, totalCount: totalCount } AS customerContactConnection
                }
                WITH this_documents { customerContactConnection: customerContactConnection } AS this_documents
                RETURN collect(this_documents) AS this_documents
            }
            CALL apoc.util.validate(NOT (any(auth_var1 IN [\\"view\\"] WHERE any(auth_var0 IN $auth.roles WHERE auth_var0 = auth_var1))), \\"@neo4j/graphql/FORBIDDEN\\", [0])
            RETURN this { documents: this_documents } as this"
        `);

        expect(formatParams(result.params)).toMatchInlineSnapshot(`
            "{
                \\"auth\\": {
                    \\"isAuthenticated\\": false,
                    \\"roles\\": []
                }
            }"
        `);
    });
});