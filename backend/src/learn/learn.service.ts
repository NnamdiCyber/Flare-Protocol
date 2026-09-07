import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { StrKey } from '@stellar/stellar-sdk';
import { PrismaService } from '../common/prisma.service';
import { OracleService, ClaimProof } from '../oracle/oracle.service';

export interface SubmitResult {
  passed: boolean;
  score: number;
}

@Injectable()
export class LearnService {
  private readonly logger = new Logger(LearnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oracle: OracleService,
  ) {}

  /**
   * Grade a quiz submission against the stored answer key.
   * POST /learn/submit/:campaignId  (JWT-protected)
   */
  async submitAnswers(
    earnerAddress: string,
    campaignId: string,
    answers: Record<string, string>,
  ): Promise<SubmitResult> {
    // Look up answer key for this campaign
    const answerKey = await this.prisma.learnAnswerKey.findUnique({
      where: { campaignId },
    });
    if (!answerKey) {
      throw new NotFoundException(
        `No answer key found for campaign ${campaignId}`,
      );
    }

    const correctAnswers = answerKey.answers as Record<string, string>;
    const totalQuestions = Object.keys(correctAnswers).length;

    if (totalQuestions === 0) {
      throw new BadRequestException('Campaign answer key is empty');
    }

    // Grade: count correct answers (case-insensitive, trimmed)
    let correct = 0;
    for (const [questionId, correctAnswer] of Object.entries(correctAnswers)) {
      const submitted = answers[questionId]?.trim().toLowerCase() ?? '';
      if (submitted === correctAnswer.trim().toLowerCase()) {
        correct++;
      }
    }

    const score = (correct / totalQuestions) * 100;
    const passed = score >= answerKey.passThreshold;

    // Upsert submission — if the earner already submitted, update the record
    await this.prisma.learnSubmission.upsert({
      where: { campaignId_earnerAddress: { campaignId, earnerAddress } },
      create: {
        campaignId,
        earnerAddress,
        score,
        passed,
      },
      update: {
        score,
        passed,
        proofIssued: false,
        submittedAt: new Date(),
      },
    });

    this.logger.log(
      `Learn submission: earner=${earnerAddress} campaign=${campaignId} ` +
        `score=${score.toFixed(1)}% passed=${passed}`,
    );

    return { passed, score };
  }

  /**
   * Issue an oracle-signed ClaimProof for a passing learn submission.
   * GET /learn/proof/:campaignId  (JWT-protected)
   */
  async getProof(earnerAddress: string, campaignId: string): Promise<ClaimProof> {
    const submission = await this.prisma.learnSubmission.findUnique({
      where: { campaignId_earnerAddress: { campaignId, earnerAddress } },
    });

    if (!submission) {
      throw new NotFoundException('No learn submission found');
    }
    if (!submission.passed) {
      throw new BadRequestException('Submission did not meet the pass threshold');
    }
    if (submission.proofIssued) {
      throw new BadRequestException('Proof already issued for this submission');
    }

    // actionHash = SHA256(earnerAddress_bytes ‖ campaignId_bytes ‖ score_as_u32_le)
    const campaignIdBuf = Buffer.from(campaignId, 'hex');
    const earnerBytes = Buffer.from(StrKey.decodeEd25519PublicKey(earnerAddress));

    // Encode score as a u32 (integer percentage, rounded) in little-endian
    const scoreBuf = Buffer.allocUnsafe(4);
    scoreBuf.writeUInt32LE(Math.round(submission.score));

    const actionHash = createHash('sha256')
      .update(earnerBytes)
      .update(campaignIdBuf)
      .update(scoreBuf)
      .digest();

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.oracle.signProof(
      campaignIdBuf,
      earnerBytes,
      actionHash,
      timestamp,
    );

    await this.prisma.learnSubmission.update({
      where: { campaignId_earnerAddress: { campaignId, earnerAddress } },
      data: { proofIssued: true },
    });

    return {
      campaignId,
      earner: earnerAddress,
      actionHash: actionHash.toString('hex'),
      timestamp,
      signature: signature.toString('hex'),
    };
  }
}
