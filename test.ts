import { experimental_createMCPClient, generateText } from 'ai';
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

import * as dotenv from 'dotenv';

dotenv.config();

export async function main() {
	let analysisClient,
		exploitClient,
		postClient,
		reconClient,
		scanClient,
		genericCmdClient,
		seqClient,
		pythonClient;

	try {
		// const analysisTransport = new Experimental_StdioMCPTransport({
		// 	command: 'python',
		// 	args: ['tools/analysis.py'],
		// });
		// const exploitTransport = new Experimental_StdioMCPTransport({
		// 	command: 'python',
		// 	args: ['tools/exploit.py'],
		// });
		// const postTransport = new Experimental_StdioMCPTransport({
		// 	command: 'python',
		// 	args: ['tools/post.py'],
		// });
		// const reconTransport = new Experimental_StdioMCPTransport({
		// 	command: 'python',
		// 	args: ['tools/recon.py'],
		// });
		// const scanTransport = new Experimental_StdioMCPTransport({
		// 	command: 'python',
		// 	args: ['tools/scan.py'],
		// });

		const genericCmdTransport = new Experimental_StdioMCPTransport({
			command: 'python',
			args: ['tools/generic_cmd.py'],
		});

		const seqTransport = new Experimental_StdioMCPTransport({
			command: 'npx',
			args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
		});

		const pythonTransport = new Experimental_StdioMCPTransport({
			command: 'python',
			args: ['tools/exec_python.py'],
		});

		// analysisClient = await experimental_createMCPClient({
		// 	transport: analysisTransport,
		// });
		// exploitClient = await experimental_createMCPClient({
		// 	transport: exploitTransport,
		// });
		// postClient = await experimental_createMCPClient({
		// 	transport: postTransport,
		// });
		// reconClient = await experimental_createMCPClient({
		// 	transport: reconTransport,
		// });
		// scanClient = await experimental_createMCPClient({
		// 	transport: scanTransport,
		// });

		genericCmdClient = await experimental_createMCPClient({
			transport: genericCmdTransport,
		});

		seqClient = await experimental_createMCPClient({
			transport: seqTransport,
		});

		pythonClient = await experimental_createMCPClient({
			transport: pythonTransport,
		});

		// const analysisTools = await analysisClient.tools();
		// const exploitTools = await exploitClient.tools();
		// const postTools = await postClient.tools();
		// const reconTools = await reconClient.tools();
		// const scanTools = await scanClient.tools();
		const genericCmdTools = await genericCmdClient.tools();
		const seqTools = await seqClient.tools();
		const pythonTools = await pythonClient.tools();

		const tools = {
			// ...analysisTools,
			// ...exploitTools,
			// ...postTools,
			// ...reconTools,
			// ...scanTools,
			...genericCmdTools,
			...seqTools,
			...pythonTools,
		};

		const system = `You are a world-class security analyst and software engineer trained in vulnerability research, reverse engineering, and secure coding practices.

    Your task is to analyze source code and infrastructure configurations to find bugs, security flaws, logic errors, insecure design patterns, and common CVE-like vulnerabilities (e.g., buffer overflows, race conditions, injection flaws, broken authentication, etc.). Use sequential thinking tool after every call.



    You must reason like an expert in real-world attack vectors (RCE, LFI, SSRF, IDOR, deserialization, etc.) and think like a black-hat hacker to uncover subtle flaws.

    When analyzing code or systems, follow these principles:
    - Identify flaws in logic, input validation, unsafe libraries, insecure defaults, etc.
    - Describe the bug clearly: what it is, how it works, and why it’s dangerous.
    - Show proof-of-concept (PoC) code or a sample exploit when applicable.
    - Suggest mitigation or fix in clear language.

    Always double-check the context (e.g., authentication, trust boundaries, privilege levels) and assume malicious input unless stated otherwise.

    When analyzing smart contracts, follow OWASP, SWC, and formal security verification patterns.

    You are precise, skeptical, and relentless in your pursuit of vulnerabilities.
    Never make up vulnerabilities—everything must be technically sound.
    You have access to OSINT and reconnaissance tools (e.g., subdomain enumeration, DNS interrogation, WHOIS lookup, search engine dorking). Use them to discover attack surface and gather intelligence.
    `;

		const prompt = `Solve this CTF. The CTF challenge is in http://challenge.nahamcon.com:30511. Give me the flag in the end. You can download files and do processing on them as well.
      Use all the tools to your disposal. Think about your each step carefully. CTF challenge context:
			
			Guess what! You're the new Talk Tuah podcast producer!! Record, upload and manage guest episodes, and make sure the new podcast management site has its security in tip-top shape!

Download ZIP archive password is: talk-tuah

The zip files is named challenge.zip in my Downloads folder. its extracted to challenge folder in Downloads only. maybe that can help.`;

		const response = await generateText({
			model: google('gemini-2.5-pro-preview-05-06'),
			temperature: 1,
			// system: system,
			tools,
			prompt,
			maxSteps: 40,
			onStepFinish: ({ usage, text, toolCalls, toolResults }) => {
				console.log(`\n--- AI Step ---`);

				if (toolCalls && toolCalls.length > 0) {
					console.log(`Calling Tool(s):`);
					toolCalls.forEach((call, idx) => {
						console.log(`  [${idx + 1}] ${call.toolName}`);
						if (call.args && Object.keys(call.args).length > 0) {
							console.log(`    Arguments:`);
							Object.entries(call.args).forEach(([k, v]) =>
								console.log(`      ${k}: ${JSON.stringify(v)}`),
							);
						}
					});
				} else {
					console.log(`Calling Tool(s): None`);
				}

				if (toolResults && toolResults.length > 0) {
					console.log(`Tool Results:`);
					toolResults.forEach((result, idx) => {
						console.log(`  [${idx + 1}] ${result.toolName}`);
						if (result.args && Object.keys(result.args).length > 0) {
							console.log(`    Arguments:`);
							Object.entries(result.args).forEach(([k, v]) =>
								console.log(`      ${k}: ${JSON.stringify(v)}`),
							);
						}
						if (result.result) {
							if (
								result.result.content &&
								Array.isArray(result.result.content)
							) {
								result.result.content.forEach((item, j) => {
									if (item.type === 'text') {
										try {
											// Try to pretty print JSON if that's what the text is
											const pretty = JSON.stringify(
												JSON.parse(item.text),
												null,
												2,
											);
											console.log(`    Result Content: ${pretty}`);
										} catch {
											console.log(`    Result Content: ${item.text.trim()}`);
										}
									}
								});
							} else {
								console.log(
									`    Result: ${JSON.stringify(result.result, null, 2)}`,
								);
							}
							if (result.result.isError) {
								console.log(`    Result: Error occurred during tool run`);
							}
						}
					});
				} else {
					console.log(`Tool Results: None`);
				}
				console.log(`--- End of Step ---\n`);
			},
		});

		console.log(response.text);
	} catch (error) {
		return new Response('Internal Server Error', { status: 500 });
	} finally {
		// await analysisClient.close();
		// await exploitClient.close();
		// await postClient.close();
		// await reconClient.close();
		// await scanClient.close();
		await genericCmdClient.close();
		await seqClient.close();
		await pythonClient.close();
	}
}

main().catch(console.error);
