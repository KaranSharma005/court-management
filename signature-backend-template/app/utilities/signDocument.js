import { Worker } from 'bullmq';
import redisInstance from '../config/redis.js';
import TemplateModel from '../models/template.js'; 
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import libre from "libreoffice-convert";
import { getIO } from '../config/socket.js';
import { signStatus } from '../constants/index.js';

export const signatureWorker = new Worker('signatureQueue',
  async job => {
    const { tempId, selectedSign, userId, signId } = job.data;
    const io = getIO();

    const templateDoc = await TemplateModel.findOne({ id: tempId });
    const createdBy = templateDoc?.createdBy.toString();
    const templatePath = templateDoc?.url;
    const signaturePath = path.resolve(
      selectedSign.replace(
        "http://localhost:3000/signature",
        "app/public/signatures/"
      )
    );
    const fileContent = fs.readFileSync(templatePath, "binary");

    io.to(userId).emit("processing-sign", tempId);
    io.to(createdBy).emit("processing-sign", tempId);

    for (const record of templateDoc.data) {
      try {
        if (record?.signStatus == signStatus.rejected) continue;

        const recordData = record.data instanceof Map
          ? Object.fromEntries(record.data.entries())
          : record.data;

        recordData["image:signature"] = signaturePath;

        const zip = new PizZip(fileContent);
        const imageModule = new ImageModule({
          centered: false,
          getImage: tag => fs.readFileSync(tag),
          getSize: () => [150, 50],
        });

        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          modules: [imageModule],
        });

        doc.render(recordData);
        const buffer = doc.getZip().generate({ type: "nodebuffer" });

        const timestamp = Date.now();
        const docxPath = path.resolve(
          process.cwd(),
          "app/public/signed",
          `${timestamp}_signed.docx`
        );

        fs.writeFileSync(docxPath, buffer);
        const docxBuf = fs.readFileSync(docxPath);
        const pdfBuf = await new Promise((resolve, reject) => {
          libre.convert(docxBuf, ".pdf", undefined, (err, done) => {
            if (err) reject(err);
            else resolve(done);
          });
        });
        const finalPdfPath = docxPath.replace(".docx", ".pdf");
        fs.writeFileSync(finalPdfPath, pdfBuf);

        record.url = `${timestamp}_signed.pdf`;
        record.signStatus = signStatus.Signed;
        record.signedDate = new Date();

        templateDoc.signCount += 1;
        await templateDoc.save();

        io.to(userId).emit("sign-count", tempId);
        io.to(createdBy).emit("sign-count", tempId);
      } catch (error) {
        console.log(`Failed to sign record ${record.id}:`, error.message);
      }
    }

    templateDoc.signedBy = userId;
    templateDoc.signatureId = signId;
    templateDoc.signStatus = signStatus.Signed;
    await templateDoc.save();

    io.to(userId).emit("sign-complete", tempId);
    io.to(createdBy).emit("sign-complete", tempId);
  },
  { connection: redisInstance }
);
