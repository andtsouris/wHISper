import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import * as z from 'zod/v4';
import type * as r4 from 'fhir/r4';
import ky from 'ky';
const baseUrl = "http://localhost:8080/fhir/";

namespace fhir {
    export async function fhirRequest<T>(options: {
        method: string,
        url: string,
        parameters?: Record<string, string>,
        json?: any,
    }) {
        return await ky<T>(options.url, {
            method: options.method,
            prefixUrl: baseUrl,
            searchParams: options.parameters,
            ...(options.json ? { json: options.json } : {}),
        }).json();
    }

    export function removeSuffix(str: string[] | string | undefined): string | undefined {
        if(!str) return str;
        if(Array.isArray(str)) {
            return str.map(s => removeSuffix(s)!).join(" ");
        }
        return str.substring(0, str.length - 3);
    }
}


// Create an MCP server
const server = new McpServer({
    name: 'his-mcp-server',
    version: '1.0.0'
});

server.registerTool(
    'get_admitted_patients',
    {
        title: "Get admitted patients",
        description: 'Retrieve a list of currently admitted patients with their patientId, full name, admission',
        inputSchema: {},
        outputSchema: {
            patients: z.array(z.object({
                patientId: z.string(),
                fullName: z.string(),
            })),
        }
    },
    async ({}) => {
        const response = await fhir.fhirRequest<r4.Bundle>({
            method: 'get',
            url: 'Patient',
            parameters: {
                '_count': '10',
            },
        });

        const output = {
            patients: response.entry?.map(entry => {
                const patient = entry.resource as r4.Patient;
                return {
                    patientId: patient.id!,
                    fullName: `${fhir.removeSuffix(patient.name![0]?.given) ?? ""} ${fhir.removeSuffix(patient.name![0]?.family) ?? ""}`,
                };
            }) ?? [],
        };
        
        return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
        };
    }
)

server.registerTool(
    'find_admitted_patient',
    {
        title: "Find an admitted patient",
        description: 'This is a very important tool to find an admitted patient and get their patientId (or multiple ones) matching a name and gender.',
        inputSchema: {
            firstName: z.string().optional(),
            lastName: z.string(),
            birthdate: z.string().optional(),
        },
        outputSchema: {
            patients: z.array(z.object({
                patientId: z.string(),
                fullName: z.string(),
                birthdate: z.string(),
                gender: z.string().optional(),
            })),
        }
    },
    async ({ firstName, lastName, birthdate }) => {
        // const output: any = {
        //     patients: [
        //         {
        //             patientId: "6c7c3216-968f-6dd0-a4be-e0a8cac3fcc8",
        //             fullName: "John Doe",
        //             birthdate: "1980-01-01",
        //         },
        //     ]
        // };

        // return {
        //     content: [{ type: 'text', text: JSON.stringify(output) }],
        //     structuredContent: output,
        // }

        const response = await fhir.fhirRequest<r4.Bundle>({
            method: 'get',
            url: 'Patient',
            parameters: {
                //...(firstName ? {"given:contains": firstName} : {}),
                ...(firstName ? { "given:contains": firstName } : {}),
                ...(lastName ? { "family:contains": lastName } : {}),
                ...(birthdate ? { "birthDate": birthdate } : {}),
            },
        });

        const output = {
            patients: response.entry?.map(entry => {
                const patient = entry.resource as r4.Patient;
                return {
                    patientId: patient.id,
                    fullName: `${patient.name![0]?.given ?? ""} ${patient.name![0]?.family ?? ""}`,
                    birthdate: patient.birthDate ?? "unknown",
                    gender: patient.gender ?? "unknown",
                };
            }) ?? [],
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
        };
    },
);

server.registerTool(
    'save_patient_note',
    {
        title: "Save a patient note",
        description: 'Saves a note (Observation resource of category "note") for a given patientId.',
        inputSchema: {
            patientId: z.string(),
            noteText: z.string(),
        },
        outputSchema: {
            success: z.boolean(),
            observationId: z.string().nullable(),
        }
    },
    async ({ patientId, noteText }) => {
        const observation: r4.Observation = {
            resourceType: 'Observation',
            status: 'final',
            category: [{
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                    code: 'note',
                    display: 'Note'
                }]
            }],
            code: {
                coding: [{
                    system: 'http://loinc.org',
                    code: '48767-8',
                    display: 'Patient note'
                }],
                text: 'Patient note'
            },
            subject: {
                reference: `Patient/${patientId}`
            },
            valueString: noteText,
        };

        const createdObservation = await fhir.fhirRequest<r4.Observation>({
            method: 'post',
            url: 'Observation',
            json: observation,
        });

        const output = {
            success: createdObservation.id ? true : false,
            observationId: createdObservation.id ?? null,
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
        };
    },
);

server.registerTool(
    'list_patient_notes',
    {
        title: "List patient notes",
        description: 'Lists all notes (Observation resources of category "note") for a given patientId.',
        inputSchema: {
            patientId: z.string(),
        },
        outputSchema: {
            notes: z.array(z.object({
                observationId: z.string(),
                noteText: z.string(),
                issued: z.string().nullable(),
            })),
        }
    },
    async ({ patientId }) => {
        const response = await fhir.fhirRequest<r4.Bundle>({
            method: 'get',
            url: 'Observation',
            parameters: {
                'subject.identifier': patientId,
                'category': 'note',
                '_count': '50',
                '_sort': '-date',
            }
        });

        const output = {
            notes: response.entry?.map(entry => {
                const obs = entry.resource as r4.Observation;
                return {
                    observationId: obs.id!,
                    noteText: obs.valueString ?? 'No text',
                    issued: obs.effectiveDateTime ?? null,
                };
            }) ?? [],
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
        };
    },
);

server.registerTool(
    'fetch_observations_by_category',
    {
        title: "Get patient observations",
        description: 'Receive Observations made about a patient like laboratory values, vitals, images, social history, therapy and symptoms etc. Optionally in a view you can filter by LOINC, SNOMED-CT oder other codes comma divided.',
        inputSchema: {
            patientId: z.string(),
            category: z.enum(['social-history', 'vital-signs', 'imaging', 'laboratory', 'procedure', 'survey', 'exam', 'therapy', 'activity', 'symptom']),
            code: z.string().optional(),
        },
        outputSchema: {
            observations: z.array(z.object({
                text: z.string(),
                value: z.any(),
            })),
        }
    },
    async ({ patientId, category, code }) => {
        const response = await fhir.fhirRequest<r4.Bundle>({
            method: 'get',
            url: 'Observation',
            parameters: {
                'subject.identifier': patientId,
                'status': 'final,amended,corrected',
                'category': category,
                '_count': '50',
                '_sort': '-date',
                ...(code ? { 'code': code } : {}),
            }
        });

        const output = {
            observations: response.entry?.map(entry => {
                const obs = entry.resource as r4.Observation;
                return {
                    text: obs.code.text ?? 'No text',
                    value: obs.valueBoolean ?? obs.valueQuantity?.value ?? obs.valueString ?? obs.valueCodeableConcept?.text ?? obs.valueDateTime ?? obs.valueInteger ?? obs.valuePeriod  ?? obs.valueString ?? obs.valueRange ?? obs.valueRatio ?? obs.valueTime ?? 'unknown',
                    ...(obs.interpretation ? { interpretation: obs.interpretation } : {}),
                    ...(obs.note ? { note: obs.note } : {}),
                };
            }) ?? [],
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
        };
    },
);

server.registerTool(
    'fetch_patient_medications',
    {
        title: "Get patient medications",
        description: 'Retrieve the list of medications prescribed to a patient.',
        inputSchema: {
            patientId: z.string(),
        },
        outputSchema: {
            medications: z.array(z.object({
                medicationName: z.string(),
                status: z.string(),
            })),
        }
    },
    async ({ patientId }) => {
        const response = await fhir.fhirRequest<r4.Bundle>({
            method: 'get',
            url: 'MedicationRequest',
            parameters: {
                'subject.identifier': patientId,
                '_count': '50',
            },
        });

        const output = {
            medications: response.entry?.map(entry => {
                const medReq = entry.resource as r4.MedicationRequest;
                return {
                    medicationName: medReq.medicationCodeableConcept?.text ?? 'Unknown medication',
                    status: medReq.status,
                    intent: medReq.intent,
                    ...(medReq.priority ? { priority: medReq.priority } : {}),
                    ...(medReq.note ? { note: medReq.note } : {}),
                    ...(medReq.reasonCode ? { reason: medReq.reasonCode } : {}),
                    ...(medReq.reasonReference ? { reasonReference: medReq.reasonReference[0]?.display } : {}),
                };
            }   ) ?? [],
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
        };
    },  
);

server.registerTool(
    'get_patient_conditions',
    {
        title: "Get patient conditions",
        description: 'Retrieve the list of conditions (diagnoses) for a patient.',
        inputSchema: {
            patientId: z.string(),
        },
        outputSchema: {
            conditions: z.array(z.object({
                conditionName: z.string(),
            })),
        }
    },
    async ({ patientId }) => {
        const response = await fhir.fhirRequest<r4.Bundle>({
            method: 'get',
            url: 'Condition',
            parameters: {
                'subject.identifier': patientId,
                '_count': '50',
                '_sort': '-onset-date',
            }
        });

        const output = {
            conditions: response.entry?.map(entry => {
                const condition = entry.resource as r4.Condition;
                return {
                    conditionName: condition.code?.text ?? 'Unknown condition',
                };
            }) ?? [],
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
        };
    },
);

server.registerTool(
    'create_order',
    {
        title: "Create an order",
        description: 'Ordern and schedule an action for a patient. Choose the snomedCode and snomedDisplay for the order that is most appropriate for the users request. Categories include laboratory, imaging (x-ray, MRI, CT), counselling, education, surgical procedure, other.',
        inputSchema: {
            patientId: z.string(),
            category: z.literal(['laboratory', 'imaging', 'counselling', 'education', 'surgical procedure', 'other']).optional(),
            description: z.string().optional(),
            snomedCode: z.string().optional(),
            snomedDisplay: z.string().optional(),
        },
        outputSchema: {
            success: z.boolean(),
            serviceRequestId: z.string().nullable(),
        }
    },
    async ({ patientId, description, category, snomedCode, snomedDisplay }) => {
        const serviceRequest: r4.ServiceRequest = {
            resourceType: 'ServiceRequest',
            status: 'active',
            intent: 'order',
            category: [{
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/service-category',
                    code: category,
                }]
            }],
            code: {
                coding: [{
                    system: 'http://snomed.info/sct',
                    code: snomedCode,
                    display: snomedDisplay,
                }],
                text: snomedDisplay || description || 'Service Request',
            },
            subject: {
                reference: `Patient/${patientId}`
            },
            note: description ? [{
                text: description
            }] : [],
        };

        const createdServiceRequest = await fhir.fhirRequest<r4.ServiceRequest>({
            method: 'post',
            url: 'ServiceRequest',
            json: serviceRequest,
        });
        
        const output = {
            success: createdServiceRequest.id ? true : false,
            serviceRequestId: createdServiceRequest.id ?? null,
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
        };
    },
);

server.registerTool(
    'get_orders',
    {
        title: "Get patient orders",
        description: 'Retrieve the list of orders (ServiceRequests) for a patient.',
        inputSchema: {
            patientId: z.string(),
        },
        outputSchema: {
            orders: z.array(z.object({
                serviceRequestId: z.string(),
                code: z.string().optional(),
                description: z.string().optional(),
                status: z.string().optional(),
            })),
        }
    },
    async ({ patientId }) => {
        const response = await fhir.fhirRequest<r4.Bundle>({
            method: 'get',
            url: 'ServiceRequest',
            parameters: {
                'subject.identifier': patientId,
                '_count': '50',
            }
        });
        const output = {
            orders: response.entry?.map(entry => {
                const order = entry.resource as r4.ServiceRequest;
                return {
                    serviceRequestId: order.id!,
                    code: order.code?.coding ? order.code.coding[0]?.code : undefined,
                    description: order.code?.text,
                    status: order.status,
                };
            }) ?? [],
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output,
        };
    }
)

// Set up Express and HTTP transport
const app = express();
app.use(express.json());

// Middleware to fix Accept header for clients that don't strictly follow MCP spec
app.use((req, res, next) => {
    const accept = req.headers.accept || '';
    if (accept.includes('application/json') && !accept.includes('text/event-stream')) {
        req.headers.accept = `${accept}, text/event-stream`;
    }
    next();
});

app.all('/mcp', async (req, res) => {
    console.log('Received request:', {
        method: req.method,
        headers: req.headers,
        body: req.body
    });

    // Create a new transport for each request to prevent request ID collisions
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    });

    res.on('close', () => {
        transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
});

const port = parseInt(process.env.PORT || '3000');
app.listen(port, () => {
    console.log(`Demo MCP Server running on http://localhost:${port}/mcp`);
}).on('error', error => {
    console.error('Server error:', error);
    process.exit(1);
});

