import { AudacityConnector } from "./AudacityConnector.mjs";


const connector = new AudacityConnector();
await connector.openAudacity();

await connector.sendCommandToAudacity(`Import2: FileName=${import.meta.dirname}\\${process.argv[2]}`)
await connector.sendCommandToAudacity("Select: Track=0")
await connector.sendCommandToAudacity("TruncateSilence: Action=\"Truncate Detected Silence\" Compress=\"50\" Independent=\"0\" Minimum=\"1.0\" Threshold=\"-40\" Truncate=\"0.25\"")
await connector.sendCommandToAudacity("ClickRemoval:Threshold=\"200\" Width=\"20\"")
await connector.sendCommandToAudacity("LoudnessNormalization:DualMono=\"1\" LUFSLevel=\"-20\" NormalizeTo=\"0\" RMSLevel=\"-20\" StereoIndependent=\"0\"")
await connector.sendCommandToAudacity(`Export2:Filename="${import.meta.dirname}\\${process.argv[3]}" NumChannels="1"`)

connector.closeAudacity();
