import axiosInstance from "./AxiosSetup";

const unwrap = (response) => response?.data?.data ?? response?.data ?? null;

const buildParams = (params = {}) => {
  const result = {};

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  });

  return result;
};

export const getExamPackets = async (examId, options = {}) => {
  const response = await axiosInstance.get(`/question-packets/exam/${examId}`, {
    params: buildParams({
      questionNumber: options.questionNumber,
    }),
  });

  return unwrap(response) || [];
};

export const getExamFlags = async (examId, options = {}) => {
  const response = await axiosInstance.get(`/question-packets/exam/${examId}/flags`, {
    params: buildParams({
      reviewStatus: options.reviewStatus,
      source: options.source,
      questionNumber: options.questionNumber,
    }),
  });

  return unwrap(response) || [];
};

export const getFlagById = async (flagId) => {
  const response = await axiosInstance.get(`/question-packets/flags/${flagId}`);
  return unwrap(response);
};

export const verifyFlagWithAI = async (flagId) => {
  const response = await axiosInstance.post(`/question-packets/flags/${flagId}/verify-with-ai`);
  return unwrap(response);
};

export const teacherReviewFlag = async (flagId, payload) => {
  const response = await axiosInstance.post(
    `/question-packets/flags/${flagId}/teacher-review`,
    payload
  );

  return unwrap(response);
};

export const runPacketSimilarityCheck = async (packetId, payload) => {
  const response = await axiosInstance.post(
    `/question-packets/${packetId}/similarity-check`,
    payload
  );

  return unwrap(response);
};

export const runExamPacketSimilarityCheck = async (examId, payload) => {
  const response = await axiosInstance.post(
    `/question-packets/exam/${examId}/similarity-check`,
    payload
  );

  return unwrap(response);
};

export const resolvePacketThreshold = async (examId, options = {}) => {
  const response = await axiosInstance.get(
    `/question-packets/exam/${examId}/effective-threshold`,
    {
      params: buildParams({
        scope: options.scope,
        questionNumber: options.questionNumber,
        requestThreshold: options.requestThreshold,
      }),
    }
  );

  return unwrap(response);
};

export const seedPacketSimilarityTestData = async (examId) => {
  const response = await axiosInstance.post(`/question-packets/exam/${examId}/seed-test-data`);
  return response?.data ?? null;
};
